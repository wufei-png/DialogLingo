import en from './en'

type LocaleResource<T> = {
  [Key in keyof T]: T[Key] extends string ? string : LocaleResource<T[Key]>
}

const zhCN = {
  common: {
    appName: 'DialogLingo',
    close: '关闭',
    cancel: '取消',
    generate: '生成',
    saved: '已保存',
    revert: '还原',
    selected: '已选择',
    notSelected: '未选择',
    settings: '设置',
    unknownSource: '未知来源',
    enable: '启用 {{label}}',
    disable: '停用 {{label}}'
  },
  navigation: {
    sections: '区域',
    search: '搜索与选择',
    workbook: '学习册'
  },
  split: {
    resizePanes: '调整面板宽度'
  },
  boot: {
    sessionScanFailed: '会话扫描失败',
    continueAnyway: '仍然继续',
    localChatToWorkbook: '本地聊天转学习册',
    discoveringTranscripts: '正在发现 Codex、Claude 和 OpenCode 会话记录...'
  },
  settings: {
    title: '设置',
    interface: '界面',
    language: '语言',
    languageEnglish: 'English',
    languageChinese: '简体中文',
    backend: '后端',
    backendOpenAiCompatible: 'OpenAI 兼容 API',
    openAiBaseUrl: 'OpenAI 兼容基础 URL',
    apiKey: 'API Key',
    defaultModel: '默认模型',
    liteLlmHelp:
      'LiteLLM 可以作为本地 OpenAI 兼容端点；使用 API 后端并填写 LiteLLM base URL。',
    generation: '生成',
    expressionDifficulty: '表达难度',
    difficultyEasy: '简单',
    difficultyAverage: '普通',
    difficultyHard: '困难',
    llmBatchSize: 'LLM 批大小',
    llmBatchSizeHelp:
      '每次 LLM 请求发送多少段转写片段。批次越大，每个会话的 API 调用越少，但 prompt 会更长。',
    llmBatchSizeQuestion: '什么是 LLM 批大小？',
    maxItemsPerSession: '每个会话最多条目',
    expressionTarget: '表达条目目标（{{percent}}%）',
    expressionTargetQuestion: '什么是表达条目目标？',
    expressionTargetHelp:
      'DialogLingo 会生成两种条目：表达和句子。这里配置的是表达条目的目标占比；句子条目使用剩余比例（{{sentencePercent}}%）。',
    sentenceTarget: '句子目标为 {{percent}}%。',
    balanceStrength: '平衡强度',
    balanceStrengthQuestion: '什么是平衡强度？',
    balanceStrengthHelp:
      '控制系统多严格地接近“表达/句子”的目标比例。数值低时会更优先保留高质量候选；数值高时最终学习册会更接近设定比例。',
    privacy: '隐私',
    flaggedItemExportPolicy: '标记条目导出策略',
    warnAndRequireKeep: '警告并要求显式保留',
    blockFlaggedItems: '阻止标记条目',
    scan: '扫描',
    scanOnLaunch: '启动时扫描',
    includeArchivedSessions: '包含归档会话',
    saveSettings: '保存设置',
    resetAllToDefaults: '全部恢复默认',
    cliExecutablePath: '{{tool}} 可执行文件路径',
    cliPathHelp: '留空则从 PATH 中查找 {{tool}}。',
    cliModel: '{{tool}} 模型',
    cliDefaultPlaceholder: '使用 CLI 默认值',
    cliTimeout: 'CLI 超时',
    messages: {
      saved: '已保存。',
      savedRescanning: '已保存。正在重新扫描会话...',
      savedAndRescanned: '已保存并重新扫描会话。',
      savedRescanFailed: '已保存，但重新扫描失败：{{message}}',
      reset: '已恢复默认设置。'
    }
  },
  search: {
    filterArea: '筛选区',
    typeKeywords: '输入关键词...',
    searchScope: '搜索范围',
    searchInAll: '搜索全部',
    searchInTitles: '搜索标题',
    searchInTranscripts: '搜索转写',
    timeRange: '时间范围',
    timeRangeWithValue: '时间范围：{{value}}',
    last7Days: '最近 7 天',
    last30Days: '最近 30 天',
    allTime: '全部时间',
    platform: '平台',
    projects: '项目',
    groupBy: '分组方式',
    groupByPlatform: '平台',
    groupByTime: '时间范围',
    groupByProject: '项目',
    selectAll: '全选',
    deselectAll: '全不选',
    selectGroup: '全选本组',
    deselectGroup: '取消全选本组',
    selected: '已选择',
    sessionsCount: '{{count}} 个会话',
    selectedSessionsCount: '已选择 {{count}} 个会话',
    noSessions: '没有会话',
    selectSession: '选择 {{title}}',
    deselectSession: '取消选择 {{title}}',
    selectSessionTitle: '选择会话',
    deselectSessionTitle: '取消选择会话',
    rescan: '重新扫描',
    generateWorkbook: '生成学习册',
    noSessionSelected: '生成前至少选择一个会话。',
    emptyPreview: '从左侧选择一个会话以查看标准化预览文本。',
    unassigned: '未分配',
    unknownDate: '未知日期'
  },
  generateWorkbook: {
    kicker: '生成学习册',
    title: '生成表达和句子条目？',
    selectedSessions: '已选择 {{count}} 个会话',
    platform: '平台',
    project: '项目',
    modelPrompt: '模型 Prompt',
    preparingPrompt: '正在准备最终 prompt...',
    minedCandidates: '包含 {{count}} 个候选项'
  },
  preview: {
    searchMatches: '搜索匹配',
    previousMatch: '上一个匹配',
    nextMatch: '下一个匹配',
    normalizedPreview: '标准化预览',
    roles: {
      user: '用户',
      assistant: '助手'
    }
  },
  workbook: {
    title: '学习册',
    emptyTitle: '从“搜索与选择”生成学习册。',
    progress: '生成进度',
    progressSessions: '{{processed}} / {{total}} 个会话',
    generationStopped: '生成已停止',
    lastCheckpoint: '最后检查点：',
    failedBatches: '失败批次：',
    resuming: '正在恢复...',
    resumeFromCheckpoint: '从检查点恢复',
    restarting: '正在重新开始...',
    restartGeneration: '重新生成',
    backToSearch: '返回搜索与选择',
    resumeFailed: '恢复失败。',
    restartFailed: '重新生成失败。',
    itemsCount: '{{count}} 个条目',
    noItemsInView: '当前视图没有学习册条目。',
    tabs: {
      all: '全部',
      expressions: '表达',
      sentences: '句子',
      deleted: '已删除'
    },
    export: '导出',
    itemTypes: {
      Expression: '表达',
      Sentence: '句子'
    },
    actions: {
      viewSource: '查看来源',
      restore: '恢复',
      delete: '删除'
    },
    status: {
      modified: '已修改',
      deleted: '已删除',
      stopped: '已停止',
      starting: '正在启动',
      pending: '等待中',
      normalizing: '正在标准化',
      mining: '正在挖掘',
      enriching: '正在补充',
      ranking: '正在排序',
      materializing: '正在生成学习册',
      completed: '已完成',
      failed: '失败',
      cancelled: '已取消'
    },
    fields: {
      target: '译文',
      gloss: '释义',
      explanation: '解释',
      quiz: '测验',
      quizAnswer: '测验答案',
      tags: '标签'
    },
    additionalFields: {
      show: '显示更多学习册字段',
      hide: '隐藏更多学习册字段'
    },
    source: {
      sourceSpan: '来源片段',
      textMatch: '文本匹配',
      noMatch: '无匹配',
      previousRef: '上一处引用',
      nextRef: '下一处引用',
      unpin: '取消固定',
      pin: '固定',
      loading: '正在加载来源...',
      context: '来源上下文',
      noContent: '没有可用的来源内容。',
      overview: '学习册概览',
      overviewHelp: '选择一张卡片，或使用“查看来源”检查完整对话上下文。'
    },
    defaults: {
      noWorkbookCreated: '没有创建学习册。',
      none: '无'
    }
  },
  export: {
    kicker: '导出学习册',
    title: '选择导出目标',
    deckName: '牌组名称',
    deckNameDescription: '用于 Anki 牌组和导出清单的名称。',
    tagPrefix: '标签前缀',
    tagPrefixDescription: '应用到生成 Anki 标签的前缀。',
    outputFolder: '输出文件夹',
    outputFolderDescription: '点击导出会先让你选择文件夹。这里作为初始打开位置。',
    bundleFolderName: '新文件夹名',
    bundleFolderNameDescription: '文本包导出会在输出文件夹内新建这个文件夹。',
    cardDirection: '卡片方向',
    cardDirectionDescription: '控制哪种语言显示在正面或背面。',
    directionEnZh: '英 -> 中',
    directionZhEn: '中 -> 英',
    directionBilingual: '双语',
    expressions: '表达',
    expressionsDescription: '包含已审核的表达卡片。',
    sentences: '句子',
    sentencesDescription: '包含已审核的句子卡片。',
    keepFlaggedItems: '保留标记条目',
    keepFlaggedItemsDescription: '导出标记为需要再次审核的条目。',
    chooseFolderTitle: '选择导出文件夹',
    exportCancelled: '已取消导出。',
    exporting: '正在导出...',
    exportSuccess: '已导出到 {{path}}',
    exportFailed: '导出失败：{{message}}',
    noWorkbookSelected: '未选择学习册。',
    format: '格式',
    exportAnkiPackage: 'Anki 包（.apkg）',
    exportAnkiTextBundle: 'Anki 文本包（.tsv + .md + .json）',
    exportGenericTextBundle: '通用文本包（.csv + .md + .json）'
  }
} satisfies LocaleResource<typeof en>

export default zhCN
