const en = {
  common: {
    appName: 'DialogLingo',
    close: 'Close',
    cancel: 'Cancel',
    generate: 'Generate',
    saved: 'Saved',
    revert: 'Revert',
    selected: 'Selected',
    notSelected: 'Not selected',
    settings: 'Settings',
    unknownSource: 'Unknown source',
    enable: 'Enable {{label}}',
    disable: 'Disable {{label}}'
  },
  navigation: {
    sections: 'Sections',
    search: 'Search & Select',
    workbook: 'Workbook'
  },
  split: {
    resizePanes: 'Resize panes'
  },
  boot: {
    sessionScanFailed: 'Session scan failed',
    continueAnyway: 'Continue anyway',
    localChatToWorkbook: 'Local chat to workbook',
    discoveringTranscripts: 'Discovering Codex, Claude, and OpenCode transcripts...'
  },
  settings: {
    title: 'Settings',
    interface: 'Interface',
    language: 'Language',
    languageEnglish: 'English',
    languageChinese: 'Simplified Chinese',
    backend: 'Backend',
    backendOpenAiCompatible: 'OpenAI-compatible API',
    openAiBaseUrl: 'OpenAI-compatible base URL',
    apiKey: 'API key',
    defaultModel: 'Default model',
    liteLlmHelp:
      'LiteLLM works as a local OpenAI-compatible endpoint; use the API backend with a LiteLLM base URL.',
    generation: 'Generation',
    expressionDifficulty: 'Expression difficulty',
    difficultyEasy: 'Easy',
    difficultyAverage: 'Average',
    difficultyHard: 'Hard',
    llmBatchSize: 'LLM batch size',
    llmBatchSizeHelp:
      'How many transcript snippets to send in each LLM request. Larger batches mean fewer API calls per session but longer prompts.',
    llmBatchSizeQuestion: 'What is LLM batch size?',
    maxItemsPerSession: 'Max items per session',
    expressionTarget: 'Expression item target ({{percent}}%)',
    expressionTargetQuestion: 'What is expression item target?',
    expressionTargetHelp:
      'DialogLingo generates two item types: expressions and sentences. This sets the target share for expression items; sentence items use the remaining share ({{sentencePercent}}%).',
    sentenceTarget: 'Sentence target is {{percent}}%.',
    balanceStrength: 'Balance strength',
    balanceStrengthQuestion: 'What is balance strength?',
    balanceStrengthHelp:
      'How strongly to enforce the expression/sentence target. Lower values let the model keep more high-quality candidates; higher values push the final workbook closer to the target mix.',
    privacy: 'Privacy',
    flaggedItemExportPolicy: 'Flagged item export policy',
    warnAndRequireKeep: 'Warn and require explicit keep',
    blockFlaggedItems: 'Block flagged items',
    scan: 'Scan',
    scanOnLaunch: 'Scan on launch',
    includeArchivedSessions: 'Include archived sessions',
    saveSettings: 'Save Settings',
    resetAllToDefaults: 'Reset all to defaults',
    cliExecutablePath: '{{tool}} executable path',
    cliPathHelp: 'Leave blank to discover {{tool}} from PATH.',
    cliModel: '{{tool}} model',
    cliDefaultPlaceholder: 'Use CLI default',
    cliTimeout: 'CLI timeout',
    messages: {
      saved: 'Saved.',
      savedRescanning: 'Saved. Rescanning sessions...',
      savedAndRescanned: 'Saved and rescanned sessions.',
      savedRescanFailed: 'Saved, but rescan failed: {{message}}',
      reset: 'Reset to defaults.'
    }
  },
  search: {
    filterArea: 'Filter area',
    typeKeywords: 'Type keywords...',
    searchScope: 'Search scope',
    searchInAll: 'Search in all',
    searchInTitles: 'Search in titles',
    searchInTranscripts: 'Search in transcripts',
    timeRange: 'Time range',
    last7Days: 'Last 7 days',
    last30Days: 'Last 30 days',
    allTime: 'All time',
    platform: 'Platform',
    projects: 'Projects',
    groupBy: 'Group by',
    groupByPlatform: 'Platform',
    groupByTime: 'Time range',
    groupByProject: 'Project',
    selectAll: 'Select all',
    deselectAll: 'Deselect all',
    selectGroup: 'Select group',
    deselectGroup: 'Deselect group',
    selected: 'Selected',
    sessionsCount: '{{count}} sessions',
    noSessions: 'No sessions',
    selectSession: 'Select {{title}}',
    deselectSession: 'Deselect {{title}}',
    selectSessionTitle: 'Select session',
    deselectSessionTitle: 'Deselect session',
    rescan: 'Rescan',
    generateWorkbook: 'Generate Workbook',
    noSessionSelected: 'Select at least one session before generating.',
    emptyPreview: 'Select a session from the left to inspect normalized preview text.',
    unassigned: 'Unassigned',
    unknownDate: 'Unknown date'
  },
  generateWorkbook: {
    kicker: 'Generate Workbook',
    title: 'Generate Expression + Sentence items?',
    selectedSessions: '{{count}} sessions selected',
    platform: 'Platform',
    project: 'Project',
    modelPrompt: 'Model prompt',
    preparingPrompt: 'Preparing final prompt...',
    minedCandidates: '{{count}} mined candidates included'
  },
  preview: {
    searchMatches: 'Search matches',
    previousMatch: 'Previous match',
    nextMatch: 'Next match',
    normalizedPreview: 'Normalized Preview',
    roles: {
      user: 'User',
      assistant: 'Assistant'
    }
  },
  workbook: {
    title: 'Workbook',
    emptyTitle: 'Generate a workbook from Search & Select.',
    progress: 'Generation Progress',
    progressSessions: '{{processed}} / {{total}} sessions',
    generationStopped: 'Generation stopped',
    lastCheckpoint: 'Last checkpoint:',
    failedBatches: 'Failed batches:',
    resuming: 'Resuming...',
    resumeFromCheckpoint: 'Resume from checkpoint',
    restarting: 'Restarting...',
    restartGeneration: 'Restart generation',
    backToSearch: 'Back to Search & Select',
    resumeFailed: 'Resume failed.',
    restartFailed: 'Restart failed.',
    itemsCount: '{{count}} items',
    noItemsInView: 'No workbook items in this view.',
    tabs: {
      all: 'All',
      expressions: 'Expressions',
      sentences: 'Sentences',
      deleted: 'Deleted'
    },
    export: 'Export',
    itemTypes: {
      Expression: 'Expression',
      Sentence: 'Sentence'
    },
    actions: {
      viewSource: 'View source',
      restore: 'Restore',
      delete: 'Delete'
    },
    status: {
      modified: 'Modified',
      deleted: 'Deleted',
      stopped: 'stopped',
      starting: 'starting',
      pending: 'pending',
      normalizing: 'normalizing',
      mining: 'mining',
      enriching: 'enriching',
      ranking: 'ranking',
      materializing: 'materializing',
      completed: 'completed',
      failed: 'failed',
      cancelled: 'cancelled'
    },
    fields: {
      target: 'Target',
      gloss: 'Gloss',
      explanation: 'Explanation',
      quiz: 'Quiz',
      quizAnswer: 'Quiz answer',
      tags: 'Tags'
    },
    additionalFields: {
      show: 'Show additional workbook fields',
      hide: 'Hide additional workbook fields'
    },
    source: {
      sourceSpan: 'Source span',
      textMatch: 'Text match',
      noMatch: 'No match',
      previousRef: 'Prev ref',
      nextRef: 'Next ref',
      unpin: 'Unpin',
      pin: 'Pin',
      loading: 'Loading source...',
      context: 'Source Context',
      noContent: 'No source content available.',
      overview: 'Workbook Overview',
      overviewHelp:
        'Select a card or use View source to inspect the full conversation context.'
    },
    defaults: {
      noWorkbookCreated: 'No workbook was created.',
      none: 'none'
    }
  },
  export: {
    kicker: 'Export Workbook',
    title: 'Choose an export target',
    deckName: 'Deck name',
    deckNameDescription: 'Name used for the Anki deck and export manifest.',
    tagPrefix: 'Tag prefix',
    tagPrefixDescription: 'Prefix applied to generated Anki tags.',
    outputFolder: 'Output folder',
    outputFolderDescription:
      'The export button asks for a folder before writing files. This field is the starting folder.',
    cardDirection: 'Card direction',
    cardDirectionDescription: 'Controls which language appears on the front or back.',
    directionEnZh: 'EN -> ZH',
    directionZhEn: 'ZH -> EN',
    directionBilingual: 'Bilingual',
    expressions: 'Expressions',
    expressionsDescription: 'Include reviewed expression cards.',
    sentences: 'Sentences',
    sentencesDescription: 'Include reviewed sentence cards.',
    keepFlaggedItems: 'Keep flagged items',
    keepFlaggedItemsDescription: 'Export items marked for another review pass.',
    chooseFolderTitle: 'Choose export folder',
    exportCancelled: 'Export cancelled.',
    exporting: 'Exporting...',
    exportSuccess: 'Exported to {{path}}',
    exportFailed: 'Export failed: {{message}}',
    noWorkbookSelected: 'No workbook selected.',
    exportAnkiPackage: 'Export Anki Package (.apkg)',
    exportAnkiTextBundle: 'Export Anki Text Bundle (.tsv + .md + .json)',
    exportGenericTextBundle: 'Export Generic Text Bundle (.csv + .md + .json)'
  }
} as const

export default en
