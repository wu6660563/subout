use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::{Deserialize, Serialize};

use crate::db;
use crate::web::{AppState, check_auth, get_db_conn};

#[derive(Deserialize)]
pub struct LoginRequest {
    pub password: Option<String>,
}

#[derive(Serialize)]
pub struct LoginResponse {
    pub token: String,
}

#[derive(Serialize)]
pub struct SetupStatusResponse {
    pub required: bool,
}

#[derive(Deserialize)]
pub struct SetupPasswordRequest {
    pub password: String,
}

fn validate_password(password: &str) -> Result<(), &'static str> {
    if password.chars().count() < 8 {
        return Err("管理员密码至少需要 8 个字符");
    }
    if password.trim().is_empty() {
        return Err("管理员密码不能全部为空格");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate_password;

    #[test]
    fn password_validation_rejects_short_and_blank_values() {
        assert!(validate_password("short").is_err());
        assert!(validate_password("        ").is_err());
    }

    #[test]
    fn password_validation_accepts_eight_non_whitespace_characters() {
        assert!(validate_password("correct8").is_ok());
    }
}

pub async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, StatusCode> {
    let input_password = payload.password.unwrap_or_default();

    let authenticated = match std::env::var("ADMIN_PASSWORD") {
        Ok(env_pw) => env_pw == input_password,
        Err(_) => {
            let conn = get_db_conn(&state.db_path)?;
            if db::get_setting(&conn, "password_setup_required")
                .ok()
                .flatten()
                .is_some_and(|value| value == "true")
            {
                return Err(StatusCode::PRECONDITION_REQUIRED);
            }
            if let Ok(Some(stored_hash)) = db::get_setting(&conn, "password_hash") {
                let authenticated = db::verify_password(&input_password, &stored_hash);
                if authenticated && !stored_hash.starts_with("$argon2") {
                    let _ = db::update_setting(
                        &conn,
                        "password_hash",
                        &db::hash_password(&input_password),
                    );
                }
                authenticated
            } else {
                false
            }
        }
    };

    if authenticated {
        let token = generate_session_token();
        let mut guard = state.session_token.write().await;
        *guard = Some(token.clone());
        Ok(Json(LoginResponse { token }))
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}

fn generate_session_token() -> String {
    URL_SAFE_NO_PAD.encode(rand::random::<[u8; 32]>())
}

pub async fn setup_status(
    State(state): State<AppState>,
) -> Result<Json<SetupStatusResponse>, StatusCode> {
    if std::env::var("ADMIN_PASSWORD").is_ok() {
        return Ok(Json(SetupStatusResponse { required: false }));
    }

    let conn = get_db_conn(&state.db_path)?;
    let required = db::get_setting(&conn, "password_setup_required")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .is_some_and(|value| value == "true");
    Ok(Json(SetupStatusResponse { required }))
}

pub async fn setup_password(
    State(state): State<AppState>,
    Json(payload): Json<SetupPasswordRequest>,
) -> Result<Json<LoginResponse>, (StatusCode, String)> {
    if std::env::var("ADMIN_PASSWORD").is_ok() {
        return Err((
            StatusCode::FORBIDDEN,
            "ADMIN_PASSWORD 已配置，请使用环境变量中的密码".to_string(),
        ));
    }
    if let Err(message) = validate_password(&payload.password) {
        return Err((StatusCode::BAD_REQUEST, message.to_string()));
    }

    let conn = get_db_conn(&state.db_path)
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "数据库连接失败".to_string()))?;
    let required = db::get_setting(&conn, "password_setup_required")
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "读取初始化状态失败".to_string()))?
        .is_some_and(|value| value == "true");
    if !required {
        return Err((
            StatusCode::CONFLICT,
            "管理员密码已经设置，请使用登录接口".to_string(),
        ));
    }

    db::update_setting(&conn, "password_hash", &db::hash_password(&payload.password))
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "保存管理员密码失败".to_string()))?;
    db::update_setting(&conn, "password_setup_required", "false")
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "保存初始化状态失败".to_string()))?;

    let token = generate_session_token();
    *state.session_token.write().await = Some(token.clone());
    Ok(Json(LoginResponse { token }))
}

pub async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<StatusCode, StatusCode> {
    check_auth(&state, &headers).await?;
    let mut guard = state.session_token.write().await;
    *guard = None;
    Ok(StatusCode::OK)
}

pub async fn auth_status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<StatusCode, StatusCode> {
    check_auth(&state, &headers).await?;
    Ok(StatusCode::OK)
}

#[derive(Deserialize)]
pub struct ChangePasswordRequest {
    pub old_password: Option<String>,
    pub new_password: Option<String>,
}

pub async fn change_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ChangePasswordRequest>,
) -> Result<Json<LoginResponse>, StatusCode> {
    check_auth(&state, &headers).await?;

    if std::env::var("ADMIN_PASSWORD").is_ok() {
        return Err(StatusCode::FORBIDDEN);
    }

    let conn = get_db_conn(&state.db_path)?;
    let stored_hash = db::get_setting(&conn, "password_hash")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;

    let old_pw = payload.old_password.unwrap_or_default();
    if !db::verify_password(&old_pw, &stored_hash) {
        return Err(StatusCode::BAD_REQUEST);
    }

    let new_pw = payload.new_password.unwrap_or_default();
    validate_password(&new_pw).map_err(|_| StatusCode::BAD_REQUEST)?;

    let new_hash = db::hash_password(&new_pw);
    db::update_setting(&conn, "password_hash", &new_hash)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let token = generate_session_token();
    *state.session_token.write().await = Some(token.clone());
    Ok(Json(LoginResponse { token }))
}
