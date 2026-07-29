import type { TextLinkSourceHandle, ImageSourceHandle, ResolvedTextLinkSource, ResolvedImageSource, TextLinkSourceResolver, VisionSourceResolver } from "./contracts.js";
export declare function resolveTextLinkSources(handles: readonly TextLinkSourceHandle[], resolver: TextLinkSourceResolver): Promise<readonly ResolvedTextLinkSource[]>;
export declare function resolveImageSources(handles: readonly ImageSourceHandle[], resolver: VisionSourceResolver): Promise<readonly ResolvedImageSource[]>;
//# sourceMappingURL=source.d.ts.map