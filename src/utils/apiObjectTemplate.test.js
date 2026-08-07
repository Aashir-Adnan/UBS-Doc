import { describe, it, expect } from 'vitest';
import { buildOutput, urlToObjectName, DEFAULT_STATE, extractFunctionNames, extractSingleFunctionName } from './apiObjectTemplate';

// These fixtures pin the exact output of the pre-migration page's generator
// (src/pages/tools/apiObject.jsx). buildOutput() here is a verbatim copy of
// that page's buildOutput(); the expected strings below were captured by
// running that copy once so any future edit that changes emitted output is
// caught as a regression rather than silently drifting from the old tool.

describe('apiObjectTemplate', () => {
  it('urlToObjectName converts a path to PascalCase + _object', () => {
    expect(urlToObjectName('/test/api')).toBe('TestApi_object');
    expect(urlToObjectName('/users/profile/update')).toBe('UsersProfileUpdate_object');
    expect(urlToObjectName('')).toBe('');
  });

  it('extractFunctionNames pulls names out in declaration order', () => {
    const code = 'async function validateUser(req, decryptedPayload) {\n  return true;\n}\nasync function enrichPayload(req, decryptedPayload) {\n  return decryptedPayload;\n}';
    expect(extractFunctionNames(code)).toEqual(['validateUser', 'enrichPayload']);
    expect(extractFunctionNames('')).toEqual([]);
  });

  it('extractSingleFunctionName returns the first (only) name', () => {
    expect(extractSingleFunctionName('async function ubs_init_wrapper(req, decryptedPayload) {}')).toBe('ubs_init_wrapper');
    expect(extractSingleFunctionName('')).toBeNull();
  });

  it('builds minimal output from DEFAULT_STATE', () => {
    const out = buildOutput(DEFAULT_STATE);
    expect(out).toBe(
      'global.TestApi_object = {\n    versions: {\n        versionData: [\n            {\n                *: {\n                    steps: [\n                        {\n                            config: {\n                                features: {\n                                    multistep: true,\n                                    parameters: true,\n                                    pagination: false\n                                },\n                                communication: {\n                                    encryption: false\n                                },\n                                verification: {\n                                    otp: false,\n                                    accessToken: false\n                                }\n                            },\n                            data: {\n                                parameters: {\n                                    fields: []\n                                },\n                                apiInfo: {\n                                    preProcessFunctions: [],\n                                    query: null,\n                                    postProcessFunction: null\n                                },\n                                requestMetaData: {\n                                    requestMethod: "POST",\n                                    permission: null,\n                                    pagination: {\n                                        pageSize: 10\n                                    }\n                                }\n                            },\n                            response: {\n                                successMessage: "Configuration generated successfully!",\n                                errorMessage: "There was an error generating the configuration."\n                            }\n                        }\n                    ]\n                }\n            }\n        ]\n    }\n}\nmodule.exports = { TestApi_object }'
    );
  });

  it('builds full output exercising encryption, otp/accessToken verification, pagination, permission, and pre/post-process parsing', () => {
    const state = {
      url: '/users/profile/update',
      multistep: false,
      parameters: true,
      pagination: true,
      encryption: true,
      encryptionAccessToken: true,
      encryptionPlatformEncryption: false,
      otp: true,
      accessToken: true,
      requestMethod: 'GET',
      permission: 'admin.read',
      pageSize: '25',
      successMessage: 'Updated!',
      errorMessage: 'Update failed.',
      preProcessDefinitions:
        'async function validateUser(req, decryptedPayload) {\n  return true;\n}\nasync function enrichPayload(req, decryptedPayload) {\n  return decryptedPayload;\n}',
      postProcessDefinition:
        'async function ubs_init_wrapper(req, decryptedPayload) {\n  return decryptedPayload;\n}',
      query: 'getUserProfile',
      fieldsJson: JSON.stringify([{ name: 'actionPerformerURDD', required: false, source: 'req.body' }]),
    };

    const out = buildOutput(state);
    expect(out).toBe(
      'async function validateUser(req, decryptedPayload) {\n  return true;\n}\nasync function enrichPayload(req, decryptedPayload) {\n  return decryptedPayload;\n}\n\nasync function ubs_init_wrapper(req, decryptedPayload) {\n  return decryptedPayload;\n}\n\nglobal.UsersProfileUpdate_object = {\n    versions: {\n        versionData: [\n            {\n                *: {\n                    steps: [\n                        {\n                            config: {\n                                features: {\n                                    multistep: false,\n                                    parameters: true,\n                                    pagination: true\n                                },\n                                communication: {\n                                    encryption: {\n                                        accessToken: true,\n                                        platformEncryption: false\n                                    }\n                                },\n                                verification: {\n                                    otp: true,\n                                    accessToken: true\n                                }\n                            },\n                            data: {\n                                parameters: {\n                                    fields: [\n                                        {\n                                            name: "actionPerformerURDD",\n                                            required: false,\n                                            source: "req.body"\n                                        }\n                                    ]\n                                },\n                                apiInfo: {\n                                    preProcessFunctions: [validateUser, enrichPayload],\n                                    query: "getUserProfile",\n                                    postProcessFunction: ubs_init_wrapper\n                                },\n                                requestMetaData: {\n                                    requestMethod: "GET",\n                                    permission: "admin.read",\n                                    pagination: {\n                                        pageSize: 25\n                                    }\n                                }\n                            },\n                            response: {\n                                successMessage: "Updated!",\n                                errorMessage: "Update failed."\n                            }\n                        }\n                    ]\n                }\n            }\n        ]\n    }\n}\nmodule.exports = { UsersProfileUpdate_object }'
    );
  });
});
