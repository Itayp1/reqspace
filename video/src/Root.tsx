import React from "react";
import { Composition } from "remotion";
import "./index.css";
import { ReqspacePromo } from "./ReqspacePromo";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ReqspacePromo"
        component={ReqspacePromo}
        durationInFrames={900}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
    </>
  );
};
