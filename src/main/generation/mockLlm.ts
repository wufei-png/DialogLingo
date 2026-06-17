import type { LearningItemDraft } from './modelAdapter'

export function isMockLlmEnabled() {
  return process.env.DIALOGLINGO_MOCK_LLM === '1'
}

export function createMockLearningItemDrafts(): LearningItemDraft[] {
  return [
    {
      itemType: 'Expression',
      sourceText: 'set up',
      targetText: '设置；配置',
      gloss: 'To prepare or configure something so it can be used.',
      contextText: 'Translate into English: “设置本地模型。”',
      explanation:
        '“set up” 常用于软件、工具或环境配置，比 “make” 更自然。',
      quizPrompt: 'Translate into English: “设置本地模型。”',
      quizAnswer: 'set up the local model',
      tags: ['software', 'configuration', 'phrasal-verb']
    },
    {
      itemType: 'Expression',
      sourceText: 'selected model',
      targetText: '所选模型',
      gloss: 'The model that has been chosen or currently selected.',
      contextText: 'Translate into English: “所选模型”',
      explanation:
        '“selected” 表示“被选中的”，常用于软件界面、设置、下拉菜单或配置项中。',
      quizPrompt: 'Translate into English: “所选模型”',
      quizAnswer: 'selected model',
      tags: ['software', 'settings', 'noun-phrase']
    },
    {
      itemType: 'Sentence',
      sourceText: "There's an issue with the selected model.",
      targetText: '所选模型有问题。',
      gloss:
        'A natural way to report that something is wrong with the currently chosen model.',
      contextText: 'A user reports an error in a model selector.',
      explanation:
        '“There’s an issue with...” 是报告问题的常用句型，比 “It is broken” 更中性、专业。',
      quizPrompt: 'Translate into English: “所选模型有问题。”',
      quizAnswer: "There's an issue with the selected model.",
      tags: ['error-message', 'software', 'problem-reporting']
    },
    {
      itemType: 'Sentence',
      sourceText: 'It may not exist or you may not have access to it.',
      targetText: '它可能不存在，或者你可能没有访问权限。',
      gloss:
        'Explains two possible reasons: the thing does not exist, or permission is missing.',
      contextText: 'A permission or missing-resource message in a product UI.',
      explanation:
        '“may not” 表示不确定的可能性；“have access to” 表示“有权限访问”或“能够使用”。',
      quizPrompt: 'Translate into English: “它可能不存在，或者你可能没有访问权限。”',
      quizAnswer: 'It may not exist or you may not have access to it.',
      tags: ['permission', 'error-message', 'access']
    }
  ]
}
