import { t } from '../i18n/index.js';
import { activityIsRecent } from '../model/activity.js';
import { activityText } from './activity-view.js';
import { updateTopBar } from './top-bar.js';
import type { HomeManagerCard } from '../card/home-manager-card.js';
import { syncPlanChoice } from '../card/plan-views.js';

export function updateShell(this: HomeManagerCard): void {
  this.insights?.update(this);
  if (this.svg) syncPlanChoice(this);
  updateTopBar(this.root, {
    title:
      this.shellContext?.homes.find(home => home.home_id === this.shellContext?.selected)?.title ??
      this.config?.title ??
      t('HomeManager'),
    admin: this._hass?.user?.is_admin === true,
    app: this.shellContext,
    activityText: activityText(this.activity.latest),
    activityTone:
      this.activity.latest && activityIsRecent(this.activity.latest, Date.now())
        ? this.activity.latest.tone
        : 'neutral',
    alertCount: this.feed.alerts.length,
    alertLevel: this.feed.alerts.some(alert => alert.level === 'critical') ? 'critical' : 'warning',
  });
  this.updateRail();
}
