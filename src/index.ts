import {
  JupyterLiteServer,
  JupyterLiteServerPlugin
} from '@jupyterlite/server';

/**
 * Initialization data for the jupyterlite-waforth-kernel extension.
 */
const plugin: JupyterLiteServerPlugin<void> = {
  id: 'jupyterlite-waforth-kernel:plugin',
  autoStart: true,
  activate: (app: JupyterLiteServer) => {
    console.log('JupyterLite server extension jupyterlite-waforth-kernel is activated!');
  }
};

export default plugin;
