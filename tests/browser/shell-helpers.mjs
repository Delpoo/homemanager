/** Since #70 there is no ⋮ menu: edit, full screen and settings are one tap away.
 * Kept so older tests read the same; it only checks the tools are there. */
export async function openCardMenu(page) {
  const tools = page.locator('.hm-tools:visible');
  if ((await tools.count()) < 1) throw new Error('Expected the HomeManager tools in the top bar');
}

/** Opens ⚙ Settings from whatever top bar is visible, then one of its sections (#70). */
export async function openSettingsSection(page, scope, section) {
  await scope.locator('.hm-tools:visible [data-command=configuration]').first().click();
  const editor = page.locator('homemanager-editor');
  await editor.locator(`[data-settings="${section}"]`).click();
  return editor;
}
/** Light, Dark or Auto now live in Settings › Appearance; leaves Settings afterwards. */
export async function chooseTheme(page, scope, value) {
  const editor = await openSettingsSection(page, scope, 'appearance-section');
  await editor.locator('homemanager-theme-choice').getByRole('combobox').selectOption(value);
  await editor.locator('homemanager-task-screen.settings-dialog .task-back').click();
}
/** 0.13: the ☰ in the room rail is the one door to Settings, in or out of edit mode.
 * Without a section it opens the first one, as Settings did before. */
export async function openSettings(scope, section) {
  const menu = scope.locator('[data-command=nav-menu]');
  // On a phone an open symbol sheet covers the rail: close it first, as a person would.
  if (!(await menu.first().isVisible())) {
    const page = typeof scope.page === 'function' ? scope.page() : scope;
    await page.keyboard.press('Escape');
  }
  await scope.locator('[data-command=nav-menu]:visible').first().click();
  const items = scope.locator('.nav-drawer .nav-item');
  await (section ? items.and(scope.locator(`[data-section="${section}"]`)) : items.first()).click();
}
/** 0.13: every section has its icon in the strip; nothing is folded any more. */
export async function openAdvanced() {}
/** Opens a Settings section by its icon in the strip (0.13). */
export async function showSection(scope, id) {
  await scope.locator(`[data-settings="${id}"]`).first().click();
}
/** 0.13: Settings always opens on a section, also on a phone. */
export async function openFirstSection() {}
