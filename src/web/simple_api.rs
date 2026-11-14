use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::simple_config::{self, SimpleConfig};
use crate::web::config::validate_config_with_singbox;
use crate::web::{AppState, check_auth, get_db_conn};

#[derive(Serialize)]
pub struct SimpleConfigResponse {
    pub config: SimpleConfig,
    pub generated: Value,
    pub rulesets: Vec<simple_config::RuleSetStatusInfo>,
}

#[derive(Deserialize)]
pub struct SaveSimpleConfigRequest {
    pub config: SimpleConfig,
    pub apply: Option<bool>,
    pub sudo_pass: Option<String>,
    pub takeover: Option<bool>,
}

pub async fn get_simple_config(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<SimpleConfigResponse>, StatusCode> {
    check_auth(&state, &headers).await?;
    let conn = get_db_conn(&state.db_path)?;

    let cfg = simple_config::get_saved_simple_config(&conn);
    let generated =
        simple_config::generate_simple_singbox_config(&conn, &cfg).unwrap_or(serde_json::json!({}));
    let rulesets = simple_config::get_rule_sets_status(&cfg.route);

    Ok(Json(SimpleConfigResponse {
        config: cfg,
        generated,
        rulesets,
    }))
}

pub async fn save_simple_config(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<SaveSimpleConfigRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;
    let conn = get_db_conn(&state.db_path).map_err(|s| (s, "数据库连接失败".to_string()))?;

    let generated = simple_config::generate_simple_singbox_config(&conn, &payload.config)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("生成简单配置失败: {}", e)))?;

    let log = generated
        .get("log")
        .cloned()
        .unwrap_or(serde_json::json!({}));
    let dns = generated
        .get("dns")
        .cloned()
        .unwrap_or(serde_json::json!({}));
    let inbounds = generated
        .get("inbounds")
        .cloned()
        .unwrap_or(serde_json::json!([]));
    let outbounds = generated
        .get("outbounds")
        .cloned()
        .unwrap_or(serde_json::json!([]));
    let route = generated
        .get("route")
        .cloned()
        .unwrap_or(serde_json::json!({}));
    let experimental = generated
        .get("experimental")
        .cloned()
        .unwrap_or(serde_json::json!({}));

    if let Err(err_msg) =
        validate_config_with_singbox(&log, &dns, &inbounds, &outbounds, &route, &experimental)
    {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("配置校验未通过: {}", err_msg),
        ));
    }

    simple_config::save_simple_config(&conn, &payload.config).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("保存配置失败: {}", e),
        )
    })?;

    if payload.apply.unwrap_or(false) {
        let sudo_pass = payload.sudo_pass.filter(|p| !p.trim().is_empty());
        let takeover = payload.takeover.unwrap_or(false);
        if let Err(e) = state
            .service_manager
            .restart_with_sudo_and_takeover(&generated, sudo_pass.as_deref(), takeover)
            .await
        {
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("配置已保存，但重启服务失败: {}", e),
            ));
        }
    }

    // 若开启规则集本地缓存优先，后台静默拉取尚未缓存的规则集以加速后续重启
    if payload.config.route.use_local_rule_sets {
        let route_cfg_clone = payload.config.route.clone();
        let mixed_port = payload.config.inbound.mixed_port;
        tokio::spawn(async move {
            let statuses = simple_config::get_rule_sets_status(&route_cfg_clone);
            if statuses.iter().any(|s| !s.cached) {
                let _ = simple_config::download_and_cache_all_rule_sets(&route_cfg_clone, Some(mixed_port)).await;
            }
        });
    }

    Ok(Json(serde_json::json!({
        "status": "success",
        "message": if payload.apply.unwrap_or(false) { "简单配置已保存并成功启动/重启 sing-box 服务" } else { "简单配置已保存" },
        "generated": generated
    })))
}

pub async fn preview_simple_config(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<SimpleConfig>,
) -> Result<Json<Value>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;
    let conn = get_db_conn(&state.db_path).map_err(|s| (s, "数据库连接失败".to_string()))?;

    let generated = simple_config::generate_simple_singbox_config(&conn, &payload)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("生成预览失败: {}", e)))?;

    Ok(Json(generated))
}

#[derive(Deserialize, Default)]
pub struct CacheRuleSetsPayload {
    pub tag: Option<String>,
}

pub async fn get_rulesets_status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<simple_config::RuleSetStatusInfo>>, StatusCode> {
    check_auth(&state, &headers).await?;
    let conn = get_db_conn(&state.db_path)?;
    let cfg = simple_config::get_saved_simple_config(&conn);
    let rulesets = simple_config::get_rule_sets_status(&cfg.route);
    Ok(Json(rulesets))
}

pub async fn cache_rulesets(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<Option<CacheRuleSetsPayload>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;
    let conn = get_db_conn(&state.db_path).map_err(|s| (s, "数据库连接失败".to_string()))?;
    let cfg = simple_config::get_saved_simple_config(&conn);

    let proxy_port = Some(cfg.inbound.mixed_port);
    let tag_filter = payload.and_then(|p| p.tag).filter(|t| !t.trim().is_empty());

    let urls = simple_config::resolve_rule_set_urls(&cfg.route);
    let mut all_targets = vec![
        ("geosite-cn", urls.geosite_cn),
        ("geosite-geolocation-!cn", urls.geosite_geolocation_not_cn),
        ("geoip-cn", urls.geoip_cn),
    ];
    if cfg.route.block_ads {
        all_targets.push(("geosite-category-ads-all", urls.geosite_ads));
    }

    let targets_to_download: Vec<_> = if let Some(ref t) = tag_filter {
        all_targets.into_iter().filter(|(tag, _)| tag == t).collect()
    } else {
        all_targets
    };

    if targets_to_download.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "未找到匹配的规则集标签".to_string()));
    }

    let mut success_count = 0;
    let mut fail_count = 0;
    let mut details = Vec::new();

    for (tag, url) in targets_to_download {
        match simple_config::download_and_cache_rule_set(tag, &url, proxy_port).await {
            Ok(info) => {
                success_count += 1;
                details.push(serde_json::json!({
                    "tag": tag,
                    "success": true,
                    "size": info.size,
                    "path": info.path
                }));
            }
            Err(e) => {
                fail_count += 1;
                details.push(serde_json::json!({
                    "tag": tag,
                    "success": false,
                    "error": e
                }));
            }
        }
    }

    let current_rulesets = simple_config::get_rule_sets_status(&cfg.route);

    Ok(Json(serde_json::json!({
        "status": if fail_count == 0 { "success" } else if success_count > 0 { "partial_success" } else { "failed" },
        "message": format!("规则集下载完成: 成功 {} 个，失败 {} 个", success_count, fail_count),
        "success_count": success_count,
        "fail_count": fail_count,
        "details": details,
        "rulesets": current_rulesets
    })))
}
