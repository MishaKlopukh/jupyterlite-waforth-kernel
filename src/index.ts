import {
  JupyterLiteServer,
  JupyterLiteServerPlugin
} from '@jupyterlite/server';

import { IKernel, IKernelSpecs } from '@jupyterlite/kernel';

import { WAForthKernel } from './kernel';

/**
 * Initialization data for the jupyterlite-waforth-kernel extension.
 */
const plugin: JupyterLiteServerPlugin<void> = {
  id: 'jupyterlite-waforth-kernel:plugin',
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
        return new WAForthKernel(options);
      }
    });
  }
};

export default plugin;
