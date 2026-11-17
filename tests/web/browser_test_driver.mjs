import {pathToFileURL} from 'node:url';
import {compilerPath} from '../../scripts/dependencies.mjs';
const driver = await import(pathToFileURL(compilerPath('tests/web/browser_test_driver.mjs')).href);
export const {navigate,evaluate,captureScreenshot,closeBrowserSession,consoleErrors,runtimeExceptions,siteOrigin,screenshotDirectory,requestedUrls,command,waitFor,onProtocolEvent,dispatchKey,clickElement}=driver;
