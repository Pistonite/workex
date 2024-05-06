/// FId for a return value for success
export const WorkexReturnFId = 0 as const;
/// FId for a return value for catch
export const WorkexCatchFId = -1 as const;

export type WorkexMessage<TProto extends string> = {
    p: TProto;
    m: number;
    f: number;
    d: unknown;
};
export function isMessage<TProto extends string>(protocol: TProto, data: unknown): data is WorkexMessage<TProto> {
    return !!data && typeof data === 'object' && 'p' in data && 'm' in data && 'f' in data && 'd' in data && data.p === protocol;
}
