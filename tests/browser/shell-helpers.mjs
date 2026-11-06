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
/** 0.13 notebook: ⚙ is the one door to Settings, in or out of edit mode. It opens the
 * menu; a section slides in from it. Without a section it stays on the menu. */
export async function openSettings(scope, section) {
  const gear = scope.locator('.hm-tools [data-command=configuration]');
  // On a phone an open symbol sheet covers the top bar: close it first, as a person would.
  if (!(await gear.first().isVisible())) {
    const page = typeof scope.page === 'function' ? scope.page() : scope;
    await page.keyboard.press('Escape');
  }
  const editor = scope.locator('homemanager-editor');
  // Already in Settings: back to its menu first.
  const back = editor.locator('homemanager-task-screen.settings-dialog .task-back');
  if ((await editor.locator('.settings-page[data-view=section]').count()) && (await back.isVisible()))
    await back.click();
  if (!(await editor.locator('.settings-page[data-view=list]').count()))
    await scope.locator('.hm-tools [data-command=configuration]:visible').first().click();
  if (section) await editor.locator(`.nb-row[data-settings="${section}"]`).click();
}
/** 0.13: every section has its icon in the strip; nothing is folded any more. */
export async function openAdvanced() {}
/** Opens a Settings section from the ⚙ menu (0.13 notebook), going back to it first. */
export async function showSection(scope, id) {
  await openSettings(scope, id);
}
/** 0.13: Settings always opens on a section, also on a phone. */
export async function openFirstSection() {}
