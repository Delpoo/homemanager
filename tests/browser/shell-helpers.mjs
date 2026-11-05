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
/** Logical actions, native panels and pending references are folded under Advanced (#70). */
export async function openAdvanced(scope) {
  const advanced = scope.locator('.settings-advanced').first();
  if (!(await advanced.evaluate(node => node.open))) await advanced.locator('summary').click();
}
/** Opens a Settings section from any view: on a phone it first goes back to the list (#70). */
export async function showSection(scope, id) {
  const button = scope.locator(`[data-settings="${id}"]`).first();
  if (!(await button.isVisible())) {
    const list = scope.locator('[data-command=settings-list]').first();
    if (await list.isVisible()) await list.click();
    const advanced = scope.locator('.settings-advanced').first();
    if (!(await button.isVisible()) && (await advanced.count()) && !(await advanced.evaluate(node => node.open)))
      await advanced.locator('summary').click();
  }
  await button.click();
}
