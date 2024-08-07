import { Region } from '@saucelabs/testcomposer';

export type second = number;

export type proxy = {
  proxyHost: string;
  proxyPort: string;
};

export type Metadata = {
  tags?: string[];
  build?: string;
};

export type Sauce = {
  metadata?: Metadata;
  region?: Region;
};

export type QuarantineMode = {
  attemptLimit?: number;
  successThreshold?: number;
};

export type TypeScriptConfig = {
  configPath?: string;
  customCompilerModulePath?: string;
  options?: {
    [key: string]: any;
  };
};

export type CompilerOptions = {
  typescript?: TypeScriptConfig;
};

export type Screenshots = {
  takeOnFails?: boolean;
  fullPage?: boolean;
};

export type Filter = {
  test?: string;
  testGrep?: string;
  fixture?: string;
  fixtureGrep?: string;
  testMeta?: {
    [key: string]: string;
  };
  fixtureMeta?: {
    [key: string]: string;
  };
};

export type Suite = {
  name: string;
  env?: {
    [key: string]: string;
  };
  config?: {
    env?: {
      [key: string]: string;
    };
  };
  browserName: string;
  platformName?: string;
  src: string[] | string;
  headless?: boolean;
  browserArgs?: string[];
  tsConfigPath?: string;
  clientScripts?: string[];
  skipJsErrors?: boolean;
  skipUncaughtErrors?: boolean;
  selectorTimeout?: number;
  assertionTimeout?: number;
  pageLoadTimeout?: number;
  ajaxRequestTimeout?: number;
  pageRequestTimeout?: number;
  browserInitTimeout?: number;
  testExecutionTimeout?: number;
  runExecutionTimeout?: number;
  speed?: number;
  stopOnFirstFail?: boolean;
  disablePageCaching?: boolean;
  disableScreenshots?: boolean;
  quarantineMode?: QuarantineMode;
  compilerOptions?: CompilerOptions;
  disableVideo?: boolean;
  screenshots?: Screenshots;
  filter?: Filter;
  preExec?: string[];
  timeout?: number;
  esm?: boolean;
};

export type TestCafeConfig = {
  sauce?: Sauce;
  path: string;
  projectPath?: string;
  suites: Suite[];
  assetsPath: string;
  suite: Suite;
  testcafe: {
    version: string;
    configFile?: string;
  };
  nodeVersion?: string;
  artifacts?: Artifacts;
};

export type Artifacts = {
  retain?: {
    [key: string]: string;
  };
};
