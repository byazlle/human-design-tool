// Windows 下隐藏控制台窗口；移动端不使用该入口。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    humandesign_tool_lib::run()
}
