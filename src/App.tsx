// 入口仅负责装配，业务分别位于：
//  - ./rules   规则引擎与预置数据（改单 / 宝石 / 迁移）
//  - ./storage 浏览器存档（localStorage）
//  - ./page    迁移台页面
export { default } from "./page";
