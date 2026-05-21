// Registers the raw-loader hooks via the modern node:module API.
// Pass as `node --import ./scripts/register-raw-loader.mjs ...` to
// avoid the deprecated --experimental-loader warning.

import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./raw-loader.mjs', pathToFileURL(import.meta.dirname + '/'));
