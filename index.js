/**
 * Host half of the UI bundle: 不注册任何东西。
 * 跟打卡片完全由 Client 半边（client.js）渲染，激活点是指令行 conversation.chat.commandview。
 */
export const name = 'paocaiyu'

/** 不需要任何 Host Service */
export const inject = []

export function apply() {}
