import * as React from "react";

const STYLE_ID = "eazo-sdk-app-area";

const APP_AREA_CSS = `
.eazo-app-area {
  display: block;
  width: 100%;
  height: 100vh;
  height: 100dvh;
  min-height: 100vh;
  min-height: 100dvh;
  flex: 0 0 auto;
}
.eazo-app-area-scroller {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: visible;
}
`;

/** Give embedded apps a definite, non-scrolling viewport-height chain. */
export function AppAreaStyles(): React.ReactElement {
  return React.createElement(
    "style",
    { id: STYLE_ID, "data-eazo-sdk": "app-area" },
    APP_AREA_CSS,
  );
}
