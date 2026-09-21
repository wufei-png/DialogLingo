# Follow-up evidence gates

当前优先级和实施入口见[可靠性实施队列](plans/reliability-queue.md)。队列中的待实施项不代表当前产品行为。

- **Reverse Extraction（逆向拾取）**：真实标注或实际使用反复显示有价值的原文片段被漏掉，并且安全的解析、候选修复不能解决时，再设计手动补卡。主进程必须重新核对所选来源。
- **Search Preview Code/Log Collapse**：真实预览定位任务明显被工具或日志块阻碍时，再考虑可展开的展示层折叠。索引、匹配文本和来源位置保持不变。

工作簿 `Source` 保持只读，以维持溯源高亮的含义。
