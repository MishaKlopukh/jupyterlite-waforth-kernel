import { KernelMessage } from '@jupyterlab/services';

import { BaseKernel, IKernel } from '@jupyterlite/kernel';

import { PromiseDelegate } from '@lumino/coreutils';

import WAForth, { ErrorCode, isSuccess, withLineBuffer } from 'waforth';

// eslint-disable-next-line @typescript-eslint/naming-convention
export interface WAForthKernelOptions extends IKernel.IOptions {
  allowEval?: boolean;
  silent?: boolean;
  caseSensitive?: boolean;
}

function WAForthErrstr(err: ErrorCode): string {
  switch (err) {
    case ErrorCode.Quit:
      return `Error: Quit (${err})`;
    case ErrorCode.Abort:
      return `Error: Abort (${err})`;
    case ErrorCode.EOI:
      return `Error: End of input (${err})`;
    case ErrorCode.Bye:
      return `Error: Bye (${err})`;
    case ErrorCode.Unknown:
    default:
      return `Unknown Error (${err})`;
  }
}

/**
 * A kernel for WAForth.
 */
export class WAForthKernel extends BaseKernel implements IKernel {
  private _ready = new PromiseDelegate<void>();
  private _forth?: WAForth;
  private opts: WAForthKernelOptions;

  constructor(options: WAForthKernelOptions) {
    super(options);
    console.log('Initializing WAForth kernel');
    this.opts = options;
    this.initInterpreter(options).then(() => {
      console.log('WAForth kernel ready');
      this._ready.resolve();
    });
  }

  protected async initInterpreter(
    options: WAForthKernelOptions
  ): Promise<void> {
    this._forth = await new WAForth().load();
    this._forth.onEmit = withLineBuffer((str: string) => {
      this.publishExecuteResult({
        execution_count: this.executionCount,
        data: {
          'text/plain': str
        },
        metadata: {}
      });
    });
    if (options.allowEval) {
      this._forth.bind('EVAL', (forth: WAForth) => {
        const str = forth.popString();
        try {
          const result = eval(str);
          forth.pushString(result);
        } catch {
          console.error('Error evaluating', str);
          forth.pushString('');
        }
      });
    }
    this._forth.bind('LOG', (forth: WAForth) => {
      console.log(forth.popString());
    });
    this._forth.bind('ALERT', (forth: WAForth) => {
      alert(forth.popString());
    });
  }

  /**
   * Dispose the kernel.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._forth = undefined;
    super.dispose();
  }

  /**
   * A promise that is fulfilled when the kernel is ready.
   */
  get ready(): Promise<void> {
    return this._ready.promise;
  }

  /**
   * Handle a kernel_info_request message
   */
  async kernelInfoRequest(): Promise<KernelMessage.IInfoReplyMsg['content']> {
    const content: KernelMessage.IInfoReply = {
      implementation: 'WAForth',
      implementation_version: '0.19.1',
      language_info: {
        codemirror_mode: {
          name: 'forth'
        },
        file_extension: '.fs',
        mimetype: 'text/x-forth',
        name: 'forth',
        nbconvert_exporter: 'text',
        pygments_lexer: 'forth',
        version: 'Forth-2012'
      },
      protocol_version: '5.3',
      status: 'ok',
      banner: 'A WAForth kernel running in the browser',
      help_links: [
        {
          text: 'WAForth',
          url: 'https://github.com/remko/waforth'
        },
        {
          text: 'WAForth Kernel',
          url: 'https://github.com/MishaKlopukh/jupyterlab-waforth-kernel'
        }
      ]
    };
    return content;
  }

  /**
   * Handle an `execute_request` message
   *
   * @param msg The parent message.
   */
  async executeRequest(
    content: KernelMessage.IExecuteRequestMsg['content']
  ): Promise<KernelMessage.IExecuteReplyMsg['content']> {
    let { code } = content;

    if (!this._forth) {
      throw new Error('WAForth interpreter not initialized');
    }

    if (this.opts.caseSensitive) {
      code = code.toUpperCase();
    }

    const result: ErrorCode = this._forth.interpret(
      code,
      this.opts.silent ?? true
    );

    if (isSuccess(result)) {
      this.publishExecuteResult({
        execution_count: this.executionCount,
        data: {
          'text/plain': ' ok'
        },
        metadata: {}
      });

      return {
        status: 'ok',
        execution_count: this.executionCount,
        user_expressions: {}
      };
    } else {
      this.publishExecuteError({
        ename: 'Error',
        evalue: WAForthErrstr(result),
        traceback: []
      });

      return {
        status: 'error',
        execution_count: this.executionCount,
        ename: 'Error',
        evalue: WAForthErrstr(result),
        traceback: []
      };
    }
  }

  /**
   * Handle an complete_request message
   *
   * @param msg The parent message.
   */
  async completeRequest(
    content: KernelMessage.ICompleteRequestMsg['content']
  ): Promise<KernelMessage.ICompleteReplyMsg['content']> {
    throw new Error('Not implemented');
  }

  /**
   * Handle an `inspect_request` message.
   *
   * @param content - The content of the request.
   *
   * @returns A promise that resolves with the response message.
   */
  async inspectRequest(
    content: KernelMessage.IInspectRequestMsg['content']
  ): Promise<KernelMessage.IInspectReplyMsg['content']> {
    throw new Error('Not implemented');
  }

  /**
   * Handle an `is_complete_request` message.
   *
   * @param content - The content of the request.
   *
   * @returns A promise that resolves with the response message.
   */
  async isCompleteRequest(
    content: KernelMessage.IIsCompleteRequestMsg['content']
  ): Promise<KernelMessage.IIsCompleteReplyMsg['content']> {
    throw new Error('Not implemented');
  }

  /**
   * Handle a `comm_info_request` message.
   *
   * @param content - The content of the request.
   *
   * @returns A promise that resolves with the response message.
   */
  async commInfoRequest(
    content: KernelMessage.ICommInfoRequestMsg['content']
  ): Promise<KernelMessage.ICommInfoReplyMsg['content']> {
    throw new Error('Not implemented');
  }

  /**
   * Send an `input_reply` message.
   *
   * @param content - The content of the reply.
   */
  inputReply(content: KernelMessage.IInputReplyMsg['content']): void {
    throw new Error('Not implemented');
  }

  /**
   * Send an `comm_open` message.
   *
   * @param msg - The comm_open message.
   */
  async commOpen(msg: KernelMessage.ICommOpenMsg): Promise<void> {
    throw new Error('Not implemented');
  }

  /**
   * Send an `comm_msg` message.
   *
   * @param msg - The comm_msg message.
   */
  async commMsg(msg: KernelMessage.ICommMsgMsg): Promise<void> {
    throw new Error('Not implemented');
  }

  /**
   * Send an `comm_close` message.
   *
   * @param close - The comm_close message.
   */
  async commClose(msg: KernelMessage.ICommCloseMsg): Promise<void> {
    throw new Error('Not implemented');
  }
}
