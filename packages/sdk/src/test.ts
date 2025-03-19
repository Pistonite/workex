import { Bar, TestFoo } from "./input";
import { WxBusRecvHandler, WxProtocolBoundSender, WxProtocolBindConfig } from "./WxBus";

import { _wxRecvImpl } from "./TestFoo.ts";

// interfaces/Bar.ts
export class _wxSenderImpl implements Bar {
    private sender: WxProtocolBoundSender;
    constructor(sender: WxProtocolBoundSender) {
        this.sender = sender;
    }
    doSomething(a: Test, c?: number | undefined) {
        return this.sender.send<string>(16, [a, c]);
    }
}

export const _wxRecvImpl = (handler: Bar): WxBusRecvHandler => {
    return (fId, args: any[]) => {
        switch (fId) {
            case 16 /* Bar.doSomething */: {
                const [a0, a1] = args;
                return handler.doSomething(a0, a1);
            }
        }
        return Promise.resolve({ err: { code: "UnknownFunction" } });
    }
}


// interfaces/Bar.bus.ts -> Bar.ts, TestFoo.ts ../Bar.ts, ../TestFoo.ts
export const testprotoBar = (handler: TestFoo, resolve?: (impl: Bar) => (void | Promise<void>)): WxProtocolBindConfig<Bar> => {
    return {
        protocol: "testproto",
        interfaces: ["Bar", "TestFoo"],
        recvHandler: _wxRecvImpl(handler),
        bindSend: (sender) => {
            const impl = new _wxSenderImpl(sender);
            resolve?.(impl);
            return impl;
        },
    }
}

export const testprotoBar = (): WxProtocolBindConfig<Record<string, never>> => {
    return {
        protocol: "testproto",
        interfaces: ["Bar", "_wxStub"],
        recvHandler: () => Promise.resolve({ err: { code: "UnexpectedStubCall" } }),
        bindSend: () => ({}),
    }
}

export const testprotoTestFoo = (handler: Bar): WxProtocolBindConfig<TestFoo> => {
    return {
        protocol: "testproto",
        interfaces: ["TestFoo", "Bar"],
    }
}
