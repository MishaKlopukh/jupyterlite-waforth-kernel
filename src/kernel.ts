import { KernelMessage, Contents } from '@jupyterlab/services';

import { BaseKernel, IKernel } from '@jupyterlite/kernel';

import { PromiseDelegate } from '@lumino/coreutils';

import WAForth, { ErrorCode, isSuccess, withLineBuffer } from 'waforth';

// eslint-disable-next-line @typescript-eslint/naming-convention
export interface WAForthKernelOptions extends IKernel.IOptions {
  fsContents?: Contents.IModel;
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
  private _words?: string[];
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
    let prelude = `
    : STATE! STATE @ ; IMMEDIATE
    : SHOWSTAT
      STATE @ IF
        ." compiling"
      ELSE
        ." <" DEPTH <# 0 #S #> TYPE ." > " .S ." ok."
      THEN
      CR
    ; IMMEDIATE
    : S+ 
      2SWAP DUP 3 PICK + HERE SWAP 2SWAP 2OVER ALLOT SWAP 
      0 DO
        SWAP DUP C@ 2 PICK C! 1+ SWAP 1+ 
      LOOP 
      SWAP DROP 4 PICK SWAP 4 PICK 
      0 DO 
        SWAP DUP C@ 2 PICK C! 1+ SWAP 1+ 
      LOOP 
      2DROP
    ;
    : NOOP ;
    DEFER " IMMEDIATE
    :NONAME
      POSTPONE ;
      EXECUTE
    ; IS " IMMEDIATE
    : S""
      STATE @ IF
        ['] NOOP ['] " DEFER!
      ELSE
        [ ' " DEFER@ ] LITERAL
        ['] " DEFER!
        :NONAME
      THEN
      POSTPONE S"
    ; IMMEDIATE
    ' NOOP IS "
    `;
    if (options.allowEval ?? true) {
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
      prelude += ' : EVAL S" EVAL" SCALL ; ';
    }
    this._forth.bind('LOG', (forth: WAForth) => {
      console.log(forth.popString());
    });
    prelude += ' : LOG S" LOG" SCALL ; ';
    this._forth.bind('ALERT', (forth: WAForth) => {
      alert(forth.popString());
    });
    prelude += ' : ALERT S" ALERT" SCALL ; ';
    if (this.opts.fsContents) {
      this._forth.bind('INCLUDE', (forth: WAForth) => {
        let fname = forth.popString();
        if (!fname[0] == '/') {
          fname = this.location + fname;
        }
        this.opts.fsContents.get(fname, {contents: 1})
          .then(({ contents }) => {
            this._forth.interpret(contents, this.opts.silent ?? true);
          })
      });
      prelude += ' : INCLUDE BL WORD COUNT S" INCLUDE" SCALL ; '
    }
    this._forth.onEmit = withLineBuffer(console.log);
    // @ts-ignore
    this._forth.interpret_str = function (str: string) {
      const _onEmit = this.onEmit;
      let result = '';
      this.onEmit = (c: string) => {
        result = result + c;
      }
      this.interpret(str, true);
      this.onEmit = _onEmit;
      return result;
    }
    const result = this._forth.interpret(prelude, this.opts.silent ?? true);
    // @ts-ignore
    this._forth.onEmit?.flush?.();
    if (!isSuccess(result)) {
      throw new Error('WAForth Initialization failed');
    }
    this._words = this._get_words();
    this._forth.onEmit = withLineBuffer((str: string) => {
      this.stream({
        name: 'stdout',
        text: str
      });
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

  protected _get_words(): string[] {
    if (!this._forth || !this._state_interp) {
      return [];
    }
    // @ts-ignore
    return this._forth.interpret_str('WORDS').split(' ');
  }

  protected get _state_interp(): boolean {
    if (!this._forth) {
      return false;
    }
    this._forth.interpret('STATE!', true);
    return this._forth.pop() === 0;
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

    // @ts-ignore
    this._forth.onEmit?.flush?.();

    if (isSuccess(result)) {
      if (this._state_interp) {
        this._words = this._get_words();
      }

      // @ts_ignore
      const statusmsg = this._forth.interpret_str("SHOWSTAT");

      this.publishExecuteResult({
        execution_count: this.executionCount,
        data: {
          'text/plain': statusmsg
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
    const { code, cursor_pos } = content;
    const cursor_start = code.slice(0, cursor_pos).lastIndexOf(' ') + 1;
    const partial_word = code.slice(cursor_start, cursor_pos);
    const completions = (this._words ?? [])
      .concat(code.match(/(?<=(:|CONSTANT|VARIABLE|CREATE)\s+)\S+/g) ?? [])
      .filter((word: string) => word.startsWith(partial_word));
    return {
      matches: completions,
      cursor_start,
      cursor_end: cursor_pos,
      metadata: {},
      status: 'ok'
    };
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
