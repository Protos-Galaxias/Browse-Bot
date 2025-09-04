import type { ToolContext } from './types';
import { parsePageTool } from './parsePage';
import { parsePageInteractiveElementsTool } from './parsePageInteractiveElements';
import { parsePageTextTool } from './parsePageText';
import { findAndClickTool } from './findAndClick';
import { findAndInsertTextTool } from './findAndInsertText';
import { selectOptionTool } from './selectOption';
import { setCheckboxTool } from './setCheckbox';
import { setRadioTool } from './setRadio';
import { finishTaskTool } from './finishTask';
import { getYouTubeSubtitlesTool } from './getYouTubeSubtitles';
import { setMemoryTool } from './setMemory';
import { createMcpDynamicTools } from './mcp-dynamic';
import { createDynamicTools } from './external-dynamic';

export const agentTools = async (context: ToolContext) => {
    const dynamicMcp = await createMcpDynamicTools();
    const external = await createDynamicTools(context);
    return {
        parsePage: parsePageTool(context),
        parsePageInteractiveElements: parsePageInteractiveElementsTool(context),
        parsePageText: parsePageTextTool(context),
        findAndClick: findAndClickTool(context),
        findAndInsertText: findAndInsertTextTool(context),
        selectOption: selectOptionTool(context),
        setCheckbox: setCheckboxTool(context),
        setRadio: setRadioTool(context),
        getYouTubeSubtitles: getYouTubeSubtitlesTool(context),
        setMemory: setMemoryTool(),
        finishTask: finishTaskTool(),
        ...dynamicMcp,
        ...external
    } as const;
};
