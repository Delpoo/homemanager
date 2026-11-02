export interface PlanImage {
  scope: string;
  sha256: string;
  format: 'svg' | 'png' | 'jpg';
  box: [number, number, number, number];
}
export interface PlanView {
  id: string;
  name: string;
  light?: PlanImage;
  dark?: PlanImage;
  lightBackground?: string;
  darkBackground?: string;
}
export function choosePlanImage(view: PlanView | undefined, dark: boolean) {
  const preferred = dark ? view?.dark : view?.light;
  return {
    image: preferred ?? (dark ? view?.light : view?.dark),
    fallback: !!view && !preferred,
    background: (dark ? view?.darkBackground : view?.lightBackground) ?? 'transparent',
  };
}
export function alignedBox(a: readonly number[], b: readonly number[]) {
  return a.length === 4 && b.length === 4 && a.every((v, i) => Math.abs(v - b[i]) < 0.001);
}
