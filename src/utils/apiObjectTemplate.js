/**
 * API Object Builder generator — extracted verbatim from the pre-migration
 * page (src/pages/tools/apiObject.jsx) so the emitted `global.<Name>_object`
 * JS string stays byte-identical to what that page produced for the same
 * inputs. Only the React/DOM-coupled pieces (state hooks, JSX, clipboard)
 * were left behind; every function here is a pure copy of the original.
 */

/** Converts URL path to object name: /test/api → TestApi_object */
export function urlToObjectName(url) {
  if (!url || typeof url !== 'string') return '';
  const segments = url.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  const pascal = segments
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
    .join('');
  return pascal ? `${pascal}_object` : '';
}

/** Default form state — matches the pre-migration page's DEFAULT_STATE. */
export const DEFAULT_STATE = {
  url: '/test/api',
  // config.features
  multistep: true,
  parameters: true,
  pagination: false,
  // config.communication
  encryption: false,
  encryptionAccessToken: false,
  encryptionPlatformEncryption: true, // at least one must be true when encryption is on
  // config.verification
  otp: false,
  accessToken: false,
  // requestMetaData
  requestMethod: 'POST',
  permission: '',
  pageSize: 10,
  // response
  successMessage: 'Configuration generated successfully!',
  errorMessage: 'There was an error generating the configuration.',
  // apiInfo — write full function definitions; names are extracted and referenced in config
  preProcessDefinitions: '',
  postProcessDefinition: '',
  query: '',
  // optional: fields JSON
  fieldsJson: '[]',
};

/** Extract function names from definition code (async function name( or function name() in order. */
export function extractFunctionNames(code) {
  if (!code || !String(code).trim()) return [];
  const regex = /(?:async\s+)?function\s+(\w+)\s*\(/g;
  const names = [];
  let m;
  while ((m = regex.exec(code)) !== null) names.push(m[1]);
  return names;
}

/** Extract single function name from definition code. */
export function extractSingleFunctionName(code) {
  const names = extractFunctionNames(code);
  return names.length > 0 ? names[0] : null;
}

export function parseFieldsJson(raw) {
  if (!raw || !String(raw).trim()) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function buildOutput(state) {
  const objectName = urlToObjectName(state.url) || 'Api_object';
  const preDefs = (state.preProcessDefinitions || '').trim();
  const postDef = (state.postProcessDefinition || '').trim();
  const preNames = extractFunctionNames(preDefs);
  const postName = extractSingleFunctionName(postDef);
  const fields = parseFieldsJson(state.fieldsJson);
  const queryVal = state.query.trim() || null;

  const obj = {
    versions: {
      versionData: [
        {
          '*': {
            steps: [
              {
                config: {
                  features: {
                    multistep: state.multistep,
                    parameters: state.parameters,
                    pagination: state.pagination,
                  },
                  communication: {
                    encryption: state.encryption
                      ? {
                          accessToken: state.encryptionAccessToken,
                          platformEncryption: state.encryptionPlatformEncryption,
                        }
                      : false,
                  },
                  verification: {
                    otp: state.otp,
                    accessToken: state.accessToken,
                  },
                },
                data: {
                  parameters: {
                    fields,
                  },
                  apiInfo: {
                    preProcessFunctions: preNames.length > 0 ? preNames : [],
                    query: queryVal,
                    postProcessFunction: postName,
                  },
                  requestMetaData: {
                    requestMethod: state.requestMethod || 'POST',
                    permission: state.permission.trim() || null,
                    pagination: {
                      pageSize: Number(state.pageSize) || 10,
                    },
                  },
                },
                response: {
                  successMessage: state.successMessage || '',
                  errorMessage: state.errorMessage || '',
                },
              },
            ],
          },
        },
      ],
    },
  };

  let js = JSON.stringify(obj, null, 4);
  js = js.replace(/"([^"]+)":/g, '$1:');
  // Output preProcessFunctions as array of identifiers when we have definitions
  if (preNames.length > 0) {
    const arrLiteral = '[' + preNames.join(', ') + ']';
    js = js.replace(
      /preProcessFunctions:\s*\[[^\]]*\]/,
      `preProcessFunctions: ${arrLiteral}`
    );
  }
  // Output postProcessFunction as identifier when we have a definition
  if (postName) {
    js = js.replace(
      new RegExp(`postProcessFunction:\\s*"${postName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`),
      `postProcessFunction: ${postName}`
    );
  }

  const definitionsBlock = [preDefs, postDef].filter(Boolean).join('\n\n');
  const configPart = `global.${objectName} = ${js}\nmodule.exports = { ${objectName} }`;
  return definitionsBlock
    ? `${definitionsBlock}\n\n${configPart}`
    : configPart;
}
