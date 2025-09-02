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

export const agentTools = (context: ToolContext) => {
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
        finishTask: finishTaskTool()
    } as const;
};
