/** Open the visible application's menu through its actual daily-use control. */
export async function openCardMenu(page) {
  const summary = page.locator('.hm-menu > summary:visible');
  const visible = await summary.all();
  if (visible.length !== 1) throw new Error(`Expected one visible HomeManager menu, found ${visible.length}`);
  if (!(await visible[0].evaluate(node => node.parentElement.open))) await visible[0].click();
}
