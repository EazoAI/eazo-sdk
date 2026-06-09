const STYLE_ID = "eazo-sdk-profile-consent-ui";

/**
 * Supplemental styles for the profile-consent popup. The dialog frame
 * (overlay / content / title / buttons) reuses the login-ui stylesheet;
 * these classes only style the scope list specific to consent.
 */
export const PROFILE_CONSENT_UI_CSS = `
.eazo-consent-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 4px 0 2px;
}
.eazo-consent-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.7);
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.07);
}
.eazo-consent-item-icon {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: rgba(238, 92, 42, 0.1);
  color: #EE5C2A;
}
.eazo-consent-item-text { display: flex; flex-direction: column; gap: 2px; }
.eazo-consent-item-title {
  font-size: 14px;
  font-weight: 600;
  color: rgba(15, 23, 42, 0.88);
}
.eazo-consent-item-desc {
  font-size: 12.5px;
  line-height: 1.4;
  color: rgba(15, 23, 42, 0.5);
}
.eazo-consent-actions {
  display: flex;
  gap: 10px;
  margin-top: 6px;
}
.eazo-consent-actions .eazo-primary-btn,
.eazo-consent-actions .eazo-secondary-btn { flex: 1; }
`;

export function ensureConsentStylesInjected(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.setAttribute("data-eazo-sdk", "profile-consent-ui");
  style.textContent = PROFILE_CONSENT_UI_CSS;
  document.head.appendChild(style);
}
