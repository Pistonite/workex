

export type WorkexMessage = WorkexMessageCommon & ({
    source: "workex-bus-hello";
    
} | {
    source: "workex-open-callee"
})

export type WorkexMessageCommon = {
    s: "workex";
    /** 
     * Protocol identifier, all buses on the other side
     * that listens to this protocol will receive this message
     */
    p: string;
}