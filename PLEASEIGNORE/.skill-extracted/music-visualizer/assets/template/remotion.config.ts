import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// The scenes are cheap SVG; the cost is frame count (60 fps x 3 min = 10,800 frames).
// Raise concurrency if the machine has the cores and RAM.
Config.setConcurrency(4);
