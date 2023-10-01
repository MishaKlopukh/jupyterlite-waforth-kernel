import {
  JupyterLiteServer,
  JupyterLiteServerPlugin
} from '@jupyterlite/server';

import { IKernel, IKernelSpecs } from '@jupyterlite/kernel';

import { WAForthKernel, WAForthKernelOptions } from './kernel';

/**
 * A plugin to register the WAForth kernel.
 */
const kernel: JupyterLiteServerPlugin<void> = {
  id: 'jupyterlite-waforth-kernel:kernel',
  autoStart: true,
  requires: [IKernelSpecs],
  activate: (app: JupyterLiteServer, kernelspecs: IKernelSpecs) => {
    kernelspecs.register({
      spec: {
        name: 'waforth',
        display_name: 'WAForth',
        language: 'waforth',
        argv: [],
        resources: {
          'logo-32x32': '',
          'logo-64x64': ''
        }
      },
      create: async (options: IKernel.IOptions): Promise<IKernel> => {
        let options: WAForthKernelOptions = options;
        options.fsContents = app.serviceManager.contents;
        return new WAForthKernel(options);
      }
    });
  }
};

const plugins: JupyterLiteServerPlugin<any>[] = [kernel];

export default plugins;
