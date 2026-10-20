// Tauri v2 桌面/移动端入口。前端为纯 Web，所有排盘计算在浏览器上下文完成（本地、无后端）。

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
