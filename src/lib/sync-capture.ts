/**
 * Capture constraints for the sync tab.
 *
 * Chrome and Edge honor `suppressLocalAudioPlayback`: the tab's audio stays in
 * the MediaStream and does not come out of the speakers. Firefox and Safari
 * ignore it, so the same capture would play the analysis out loud. The sync
 * page refuses to start unless the browser is one of the two that silence it.
 *
 * `video: true` is required by getDisplayMedia. The frames are not recorded.
 * `preferCurrentTab` and `selfBrowserSurface: 'include'` ask for this tab.
 */
export type TabCaptureConstraints = DisplayMediaStreamOptions & {
  preferCurrentTab?: boolean;
  selfBrowserSurface?: 'include' | 'exclude';
  audio?: boolean | (MediaTrackConstraints & { suppressLocalAudioPlayback?: boolean });
};

export const TAB_CAPTURE: TabCaptureConstraints = {
  video: true,
  audio: { suppressLocalAudioPlayback: true },
  preferCurrentTab: true,
  selfBrowserSurface: 'include',
};

export function supportsSilentTabCapture(userAgent: string): boolean {
  const ua = userAgent || '';
  if (/Firefox|FxiOS/i.test(ua)) return false;
  if (/Edg\/|EdgiOS\/|EdgA\//.test(ua)) return true;
  if (/Chrome|Chromium|CriOS|OPR\//.test(ua)) return true;
  return false;
}
