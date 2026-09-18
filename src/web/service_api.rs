use axum::{
    Json,
    extract::{Query, State},
    http::{HeaderMap, StatusCode, header},
    response::IntoResponse,
};
use serde::Deserialize;
use serde_json::Value;

use crate::audit::{AuditEvent, MAX_AUDIT_EVENTS, MAX_RETENTION_MINUTES};
use crate::db;
use crate::generator;
use crate::service::ServiceStatusInfo;
use crate::simple_config;
use crate::web::{AppState, check_auth, get_db_conn};

#[derive(Deserialize)]
pub struct StartServiceRequest {
    pub config: Option<Value>,
    pub sudo_pass: Option<String>,
    pub takeover: Option<bool>,
}

#[derive(Deserialize)]
pub struct TakeoverServiceRequest {
    pub sudo_pass: Option<String>,
    pub start_after_takeover: Option<bool>,
    pub config: Option<Value>,
}

#[derive(Deserialize)]
pub struct KillExternalProcessRequest {
    pub pid: u32,
    pub sudo_pass: Option<String>,
}

pub async fn get_service_status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ServiceStatusInfo>, StatusCode> {
    check_auth(&state, &headers).await?;
    let status = state.service_manager.get_status().await;
    Ok(Json(status))
}

pub async fn kill_external_service(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<KillExternalProcessRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;

    let sudo_pass = payload.sudo_pass.filter(|p| !p.trim().is_empty());

    state
        .service_manager
        .kill_external_process(payload.pid, sudo_pass.as_deref())
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("终止外部进程失败: {}", e),
            )
        })?;

    Ok(Json(serde_json::json!({
        "status": "success",
        "message": format!("已成功终止外部进程 (PID: {})", payload.pid)
    })))
}

pub async fn takeover_service(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<Option<TakeoverServiceRequest>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;

    let conn = get_db_conn(&state.db_path).map_err(|s| (s, "数据库连接失败".to_string()))?;

    let (sudo_pass, start_after, custom_config) = if let Some(req) = payload {
        (
            req.sudo_pass.filter(|p| !p.trim().is_empty()),
            req.start_after_takeover.unwrap_or(true),
            req.config,
        )
    } else {
        (None, true, None)
    };

    if start_after {
        let config_val = if let Some(c) = custom_config {
            c
        } else {
            get_active_config_for_mode(&conn)?
        };

        state
            .service_manager
            .takeover_and_start(&config_val, sudo_pass.as_deref())
            .await
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("一键接管并启动服务失败: {}", e),
                )
            })?;

        Ok(Json(serde_json::json!({
            "status": "success",
            "message": "已成功接管外部服务并启动 Subout 代理"
        })))
    } else {
        state
            .service_manager
            .takeover_external_processes(sudo_pass.as_deref())
            .await
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("接管外部进程失败: {}", e),
                )
            })?;

        Ok(Json(serde_json::json!({
            "status": "success",
            "message": "已成功接管并终止全部外部 sing-box 服务"
        })))
    }
}

pub async fn start_service(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<Option<StartServiceRequest>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;

    let conn = get_db_conn(&state.db_path).map_err(|s| (s, "数据库连接失败".to_string()))?;

    let (config_val, custom_sudo_pass, takeover) = if let Some(req) = payload {
        let conf = if let Some(c) = req.config {
            c
        } else {
            get_active_config_for_mode(&conn)?
        };
        (conf, req.sudo_pass, req.takeover.unwrap_or(false))
    } else {
        (get_active_config_for_mode(&conn)?, None, false)
    };

    let sudo_pass = custom_sudo_pass.filter(|p| !p.trim().is_empty());

    state
        .service_manager
        .start_with_sudo_and_takeover(&config_val, sudo_pass.as_deref(), takeover)
        .await
        .map_err(|e| {
            let err_str = e.to_string();
            if err_str.contains("外部 sing-box 服务正在运行")
                || err_str.contains("外部独立的 sing-box")
            {
                (StatusCode::CONFLICT, format!("启动服务失败: {}", err_str))
            } else {
                (
                    StatusCode::BAD_REQUEST,
                    format!("启动服务失败: {}", err_str),
                )
            }
        })?;

    // 在同一请求里读取启动后状态。前端据此立即更新，而不是等待下一轮轮询；
    // 这也避免了启动前已发出的“未运行”轮询响应覆盖新状态。
    let service_status = state.service_manager.get_status().await;

    Ok(Json(serde_json::json!({
        "status": "success",
        "message": "sing-box 服务已成功启动",
        "service_status": service_status
    })))
}

#[derive(serde::Serialize)]
pub struct AuditSnapshotResponse {
    pub events: Vec<AuditEvent>,
    pub current: Vec<AuditEvent>,
    pub retention_minutes: u64,
    pub max_retention_minutes: u64,
    pub recording_enabled: bool,
    pub health: AuditHealthResponse,
}

#[derive(serde::Serialize)]
pub struct AuditHealthResponse {
    pub process_identified: bool,
    pub logs_parsed: bool,
    pub nodes_resolved: bool,
    pub node_resolution_degraded: bool,
    pub event_cap_reached: bool,
    pub dropped_lines: u64,
}

fn audit_health(
    events: &[AuditEvent],
    current: &[AuditEvent],
    dropped_lines: u64,
) -> AuditHealthResponse {
    let proxy_events = current
        .iter()
        .filter(|event| event.route_kind == crate::audit::RouteKind::Proxy)
        .collect::<Vec<_>>();
    let degraded = proxy_events.iter().any(|event| event.final_node.is_none());
    AuditHealthResponse {
        process_identified: current.iter().any(|event| {
            event.pid.is_some() || event.process_name.is_some() || event.process_path.is_some()
        }),
        logs_parsed: !events.is_empty(),
        nodes_resolved: proxy_events.is_empty() || !degraded,
        node_resolution_degraded: degraded,
        event_cap_reached: events.len() >= MAX_AUDIT_EVENTS,
        dropped_lines,
    }
}

#[derive(serde::Serialize)]
pub struct AuditSettingsResponse {
    pub retention_minutes: u64,
    pub recording_enabled: bool,
    pub options: Vec<u64>,
}

#[derive(Deserialize)]
pub struct AuditSettingsRequest {
    pub retention_minutes: u64,
    pub recording_enabled: Option<bool>,
}

#[derive(Deserialize, Default)]
pub struct AuditExportQuery {
    process: Option<String>,
    target: Option<String>,
    node: Option<String>,
    route: Option<String>,
    protocol: Option<String>,
    from: Option<u64>,
    sort_field: Option<String>,
    sort_direction: Option<String>,
}

pub fn validate_audit_retention_minutes(minutes: u64) -> Result<u64, String> {
    match minutes {
        10 | 20 => Ok(minutes),
        _ => Err(format!(
            "审计保留时长必须为 10 或 20 分钟（最大 {} 分钟）",
            MAX_RETENTION_MINUTES
        )),
    }
}

pub async fn get_service_audit(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<AuditSnapshotResponse>, StatusCode> {
    check_auth(&state, &headers).await?;
    let (current, events) = state.service_manager.get_audit_records().await;
    let retention_minutes = state.service_manager.audit_retention_minutes().await;
    let recording_enabled = state.service_manager.audit_recording_enabled().await;
    let health = audit_health(
        &events,
        &current,
        state.service_manager.audit_queue_dropped_lines(),
    );
    Ok(Json(AuditSnapshotResponse {
        events,
        current,
        retention_minutes,
        max_retention_minutes: MAX_RETENTION_MINUTES,
        recording_enabled,
        health,
    }))
}

pub async fn export_service_audit(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<AuditExportQuery>,
) -> Result<impl IntoResponse, StatusCode> {
    check_auth(&state, &headers).await?;
    let (_, events) = state.service_manager.get_audit_records().await;
    let mut events = filter_audit_export_events(events, &query);
    sort_audit_export_events(&mut events, &query);
    let body = serde_json::to_vec_pretty(&events).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok((
        [
            (header::CONTENT_TYPE, "application/json; charset=utf-8"),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=connection-audit.json",
            ),
        ],
        body,
    ))
}

fn filter_audit_export_events(
    events: Vec<AuditEvent>,
    query: &AuditExportQuery,
) -> Vec<AuditEvent> {
    let process = query
        .process
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    let target = query
        .target
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    let node = query
        .node
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    let route = query
        .route
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_ascii_uppercase();
    let protocol = query
        .protocol
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_ascii_uppercase();
    events
        .into_iter()
        .filter(|event| event.route_kind != crate::audit::RouteKind::Direct)
        .filter(|event| {
            process.is_empty()
                || format!(
                    "{} {} {}",
                    event.process_name.as_deref().unwrap_or(""),
                    event.pid.map(|pid| pid.to_string()).unwrap_or_default(),
                    event.process_path.as_deref().unwrap_or("")
                )
                .to_ascii_lowercase()
                .contains(&process)
        })
        .filter(|event| {
            target.is_empty() || event.target_display.to_ascii_lowercase().contains(&target)
        })
        .filter(|event| {
            route.is_empty() || format!("{:?}", event.route_kind).to_ascii_uppercase() == route
        })
        .filter(|event| {
            protocol.is_empty() || format!("{:?}", event.protocol).to_ascii_uppercase() == protocol
        })
        .filter(|event| {
            node.is_empty()
                || format!(
                    "{} {}",
                    event.final_node.as_deref().unwrap_or(""),
                    event.outbound_chain.join(" ")
                )
                .to_ascii_lowercase()
                .contains(&node)
        })
        .filter(|event| {
            query
                .from
                .is_none_or(|from| event.last_seen.max(event.first_seen) >= from)
        })
        .collect()
}

fn sort_audit_export_events(events: &mut [AuditEvent], query: &AuditExportQuery) {
    let direction = if query.sort_direction.as_deref() == Some("asc") {
        1
    } else {
        -1
    };
    events.sort_by(|left, right| {
        let ordering = match query.sort_field.as_deref() {
            Some("process") => format!(
                "{} {}",
                left.process_name.as_deref().unwrap_or(""),
                left.pid.unwrap_or_default()
            )
            .to_ascii_lowercase()
            .cmp(
                &format!(
                    "{} {}",
                    right.process_name.as_deref().unwrap_or(""),
                    right.pid.unwrap_or_default()
                )
                .to_ascii_lowercase(),
            ),
            Some("node") => left
                .final_node
                .as_deref()
                .unwrap_or("")
                .to_ascii_lowercase()
                .cmp(
                    &right
                        .final_node
                        .as_deref()
                        .unwrap_or("")
                        .to_ascii_lowercase(),
                ),
            Some("first_seen") => left.first_seen.cmp(&right.first_seen),
            _ => left.last_seen.cmp(&right.last_seen),
        };
        if direction == 1 {
            ordering
        } else {
            ordering.reverse()
        }
    });
}

pub async fn clear_service_audit(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<StatusCode, StatusCode> {
    check_auth(&state, &headers).await?;
    state.service_manager.clear_audit().await;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn get_service_audit_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<AuditSettingsResponse>, StatusCode> {
    check_auth(&state, &headers).await?;
    Ok(Json(AuditSettingsResponse {
        retention_minutes: state.service_manager.audit_retention_minutes().await,
        recording_enabled: state.service_manager.audit_recording_enabled().await,
        options: vec![10, 20],
    }))
}

pub async fn save_service_audit_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<AuditSettingsRequest>,
) -> Result<Json<AuditSettingsResponse>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|status| (status, "未授权".to_string()))?;
    let minutes = validate_audit_retention_minutes(payload.retention_minutes)
        .map_err(|message| (StatusCode::BAD_REQUEST, message))?;
    let minutes = state
        .service_manager
        .set_audit_retention_minutes(minutes)
        .await
        .map_err(|error| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("保存审计设置失败: {}", error),
            )
        })?;
    let recording_enabled = if let Some(enabled) = payload.recording_enabled {
        state
            .service_manager
            .set_audit_recording_enabled(enabled)
            .await
            .map_err(|error| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("保存审计设置失败: {}", error),
                )
            })?
    } else {
        state.service_manager.audit_recording_enabled().await
    };
    Ok(Json(AuditSettingsResponse {
        retention_minutes: minutes,
        recording_enabled,
        options: vec![10, 20],
    }))
}

pub async fn stop_service(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;

    state.service_manager.stop().await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("停止服务失败: {}", e),
        )
    })?;

    // 与启动/重启接口保持一致：操作完成后直接返回最终状态，前端无需等待
    // 下一轮异步轮询才能从“运行中”切换到“已停止”。
    let service_status = state.service_manager.get_status().await;

    Ok(Json(serde_json::json!({
        "status": "success",
        "message": "sing-box 服务已停止",
        "service_status": service_status
    })))
}

pub async fn restart_service(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<Option<StartServiceRequest>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    check_auth(&state, &headers)
        .await
        .map_err(|s| (s, "未授权".to_string()))?;

    let conn = get_db_conn(&state.db_path).map_err(|s| (s, "数据库连接失败".to_string()))?;

    let (config_val, custom_sudo_pass, takeover) = if let Some(req) = payload {
        let conf = if let Some(c) = req.config {
            c
        } else {
            get_active_config_for_mode(&conn)?
        };
        (conf, req.sudo_pass, req.takeover.unwrap_or(false))
    } else {
        (get_active_config_for_mode(&conn)?, None, false)
    };

    let sudo_pass = custom_sudo_pass.filter(|p| !p.trim().is_empty());

    state
        .service_manager
        .restart_with_sudo_and_takeover(&config_val, sudo_pass.as_deref(), takeover)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("重启服务失败: {}", e),
            )
        })?;

    // restart_with_sudo_and_takeover 在返回前已完成新进程的启动检查；把这个
    // 同一时刻的状态返回，避免旧轮询结果短暂把页面显示为停止状态。
    let service_status = state.service_manager.get_status().await;

    Ok(Json(serde_json::json!({
        "status": "success",
        "message": "sing-box 服务已重启",
        "service_status": service_status
    })))
}

pub async fn get_service_logs(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<String>>, StatusCode> {
    check_auth(&state, &headers).await?;
    let logs = state.service_manager.get_logs().await;
    Ok(Json(logs))
}

pub async fn clear_service_logs(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<StatusCode, StatusCode> {
    check_auth(&state, &headers).await?;
    state.service_manager.clear_logs().await;
    Ok(StatusCode::OK)
}

pub fn get_config_for_mode(
    conn: &rusqlite::Connection,
    mode: &str,
) -> Result<Value, (StatusCode, String)> {
    if mode == "simple" {
        let simple_cfg = simple_config::get_saved_simple_config(conn);
        simple_config::generate_simple_singbox_config(conn, &simple_cfg).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("生成简单配置失败: {}", e),
            )
        })
    } else {
        // In expert mode, check if running_config_id is set
        let running_id_str = db::get_setting(conn, "running_config_id")
            .unwrap_or(None)
            .unwrap_or_default();

        if let Ok(id) = running_id_str.parse::<i64>()
            && let Ok(Some(history)) = db::get_config_history_detail(conn, id)
            && let Some(content_str) = history.content
            && let Ok(c) = serde_json::from_str::<Value>(&content_str)
        {
            let log = c.get("log").cloned().unwrap_or(serde_json::json!({}));
            let dns = c.get("dns").cloned().unwrap_or(serde_json::json!({}));
            let inbounds = c.get("inbounds").cloned().unwrap_or(serde_json::json!([]));
            let outbounds = c.get("outbounds").cloned().unwrap_or(serde_json::json!([]));
            let route = c.get("route").cloned().unwrap_or(serde_json::json!({}));
            let experimental = c
                .get("experimental")
                .cloned()
                .unwrap_or(serde_json::json!({}));
            return generator::generate_config_with_base(
                conn,
                log,
                dns,
                inbounds,
                outbounds,
                route,
                experimental,
            )
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("生成配置失败: {}", e),
                )
            });
        }

        generator::generate_config(conn).map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("生成配置失败: {}", e),
            )
        })
    }
}

pub fn get_active_config_for_mode(
    conn: &rusqlite::Connection,
) -> Result<Value, (StatusCode, String)> {
    let mode = db::get_setting(conn, "app_mode")
        .unwrap_or(None)
        .unwrap_or_else(|| "simple".to_string());
    get_config_for_mode(conn, &mode)
}

#[cfg(test)]
mod audit_api_tests {
    use super::*;

    #[test]
    fn audit_retention_accepts_only_ui_options() {
        for minutes in [10, 20] {
            assert_eq!(validate_audit_retention_minutes(minutes), Ok(minutes));
        }
        for minutes in [0, 1, 11, 19, 21, 30, 60, 120] {
            assert!(validate_audit_retention_minutes(minutes).is_err());
        }
    }
}
