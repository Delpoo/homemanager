/** Since #70 there is no ⋮ menu: edit, full screen and settings are one tap away.
 * Kept so older tests read the same; it only checks the tools are there. */
export async function openCardMenu(page) {
  const tools = page.locator('.hm-tools:visible');
  if ((await tools.count()) < 1) throw new Error('Expected the HomeManager tools in the top bar');
}

/** Opens ⚙ Settings from whatever top bar is visible, then one of its sections (#70). */
export async function openSettingsSection(page, scope, section) {
  await openSettings(page, section);
  return page.locator('homemanager-editor');
}
/** Light, Dark or Auto now live in Settings › Appearance; leaves Settings afterwards. */
export async function chooseTheme(page, scope, value) {
  const editor = await openSettingsSection(page, scope, 'appearance-section');
  await editor.locator('homemanager-theme-choice').getByRole('combobox').selectOption(value);
  await editor.locator('homemanager-task-screen.settings-dialog .task-close').click();
}
/** 0.13 notebook: ⚙ is the one door to Settings, in or out of edit mode. It opens the
 * menu; a section slides in from it. Without a section it stays on the menu. */
export async function openSettings(scope, section) {
  // Callers pass the page, the card or the editor: the gear and the sheet are found from the page.
  const page = typeof scope.page === 'function' ? scope.page() : scope;
  // The card's ⚙, or the editor's own button when the editor is tested alone.
  const gear = page.locator(
    '.hm-tools [data-command=configuration]:visible, homemanager-editor .toolbar [data-command=settings]:visible',
  );
  const editor = page.locator('homemanager-editor');
  const back = editor.locator('homemanager-task-screen.settings-dialog .task-close');
  // Already in a section: back to the menu first.
  if ((await editor.locator('.settings-page[data-view=section]').count()) && (await back.isVisible()))
    await back.click();
  if (!(await editor.locator('.settings-page[data-view=list]').count())) {
    // On a phone an open symbol sheet covers the top bar: close it first, as a person would.
    if (!(await gear.count())) await page.keyboard.press('Escape');
    await gear.first().click();
  }
  if (section) await editor.locator(`.nb-row[data-settings="${section}"]`).click();
}
/** 0.13: every section has its icon in the strip; nothing is folded any more. */
export async function openAdvanced() {}
/** Opens a Settings section from the ⚙ menu (0.13 notebook), going back to it first. */
export async function showSection(scope, id) {
  await openSettings(scope, id);
}
/** 0.13 notebook: Settings opens on its menu; older tests expect Spaces, the first section. */
export async function openFirstSection(page) {
  if (!page) return;
  const editor = page.locator('homemanager-editor');
  if (await editor.locator('.settings-page[data-view=list]').count())
    await editor.locator('.nb-row[data-settings="rooms-section"]').click();
}

/** 0.13 Alerts: the reading is picked from the sentence's first pill. */
export async function pickReading(screen, id) {
  await screen.locator('#g-read').click();
  await screen.locator(`input[data-check-field=sources][value="${id}"]`).check();
}
export async function pickSymbol(screen, id) {
  await screen.locator('[data-pick=symbol]').click();
  await screen.locator(`input[data-check-field=symbols][value="${id}"]`).check();
}
