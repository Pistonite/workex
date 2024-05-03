/// FId for a return value for success
export const WorkexReturnFId = 0 as const;
/// FId for a return value for catch
export const WorkexCatchFId = -1 as const;

export type WorkexMessage<TProto extends string> = [TProto, number, typeof WorkexReturnFId | typeof WorkexCatchFId, unknown];
export function isMessage<TProto extends string>(protocol: TProto, data: unknown): data is WorkexMessage<TProto> {
    return Array.isArray(data) && data.length === 4 && data[0] === protocol && (data[2] === WorkexReturnFId || data[2] === WorkexCatchFId);
}
