import * as React from "react";

const STYLE_ID = "eazo-sdk-app-area";

const APP_AREA_CSS = `
.eazo-app-area,
.eazo-app-area-scroller {
  display: contents;
}
`;

/** Keep the always-rendered wrapper layers layout-neutral from SSR onward. */
export function AppAreaStyles(): React.ReactElement {
  return React.createElement(
    "style",
    { id: STYLE_ID, "data-eazo-sdk": "app-area" },
    APP_AREA_CSS,
  );
}
