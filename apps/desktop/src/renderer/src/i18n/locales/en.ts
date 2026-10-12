import type { Messages } from './vi'

export const en: Messages = {
  nav: {
    record: 'Record',
    projects: 'Projects',
    editor: 'Editor',
    live: 'Livestream',
    settings: 'Settings',
  },
  record: {
    title: 'Screen recording',
    description:
      'Record your screen, webcam and microphone. Cursor movement is captured for auto-zoom.',
  },
  projects: {
    title: 'Projects',
    description: 'Your recordings will show up here.',
    empty: 'No projects yet. Click "Record" to get started.',
  },
  editor: {
    title: 'Editor',
    description: 'Auto-zoom, smooth cursor, backgrounds, webcam, timeline and export.',
  },
  live: {
    title: 'Livestream',
    description: 'Stream to YouTube, Facebook and TikTok at once, and invite guests with a link.',
  },
  comingSoon: 'Coming soon ({{phase}})',
  phase: 'Phase',
  settings: {
    title: 'Settings',
    general: 'General',
    language: 'Language',
    theme: 'Theme',
    themes: { system: 'System', dark: 'Dark', light: 'Light' },
    apiKeys: 'API keys',
    apiKeysHint:
      'Keys are encrypted and stored only on this computer. Lumora uses them for captions and AI editing.',
    encryptionUnavailable:
      'This computer does not support encryption, so API keys cannot be stored safely.',
    about: 'About',
    version: 'Version {{version}}',
  },
  keys: {
    elevenlabs: { name: 'ElevenLabs', purpose: 'Speech-to-text captions' },
    anthropic: { name: 'Claude (Anthropic)', purpose: 'AI editing, titles and chapters' },
    getKey: 'Get a key',
    notSet: 'Not set',
    saved: 'Saved: {{masked}}',
    placeholder: 'Paste your API key here',
    save: 'Save',
    test: 'Test',
    remove: 'Remove',
    testing: 'Testing…',
    valid: 'Key is valid',
    savedOk: 'Key saved',
    removedOk: 'Key removed',
    errors: {
      empty: 'Please enter a key',
      whitespace: 'The key must not contain spaces',
      too_short: 'The key is too short — it may be cut off',
      wrong_prefix: 'Claude keys start with "sk-ant-"',
      invalid: 'The key is incorrect or has been revoked',
      network: 'Could not reach the server. Check your connection and try again',
      unknown: 'Could not verify the key: {{message}}',
      saveFailed: 'Could not save the key: {{message}}',
    },
  },
}
