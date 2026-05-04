import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";
import type { ErrorType, BodyType } from "./custom-fetch";
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
export interface SavedMindMap {
    id: number;
    deckId: number;
    title: string;
    data: string;
    cardCount: number;
    createdAt: string;
}
export interface CreateMindMapBody {
    title: string;
    data: unknown;
    cardCount?: number;
}
export declare const getListDeckMindMapsQueryKey: (deckId: number) => readonly [`/api/decks/${number}/mind-maps`];
export declare const listDeckMindMaps: (deckId: number, options?: RequestInit) => Promise<SavedMindMap[]>;
export declare const getListDeckMindMapsQueryOptions: <TData = Awaited<ReturnType<typeof listDeckMindMaps>>, TError = ErrorType<unknown>>(deckId: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listDeckMindMaps>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listDeckMindMaps>>, TError, TData> & {
    queryKey: QueryKey;
};
export declare const useListDeckMindMaps: <TData = Awaited<ReturnType<typeof listDeckMindMaps>>, TError = ErrorType<unknown>>(deckId: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listDeckMindMaps>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const createDeckMindMap: (deckId: number, body: BodyType<CreateMindMapBody>, options?: RequestInit) => Promise<SavedMindMap>;
export declare const useCreateDeckMindMap: <TError = ErrorType<unknown>, TContext = unknown>(deckId: number, options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createDeckMindMap>>, TError, BodyType<CreateMindMapBody>, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createDeckMindMap>>, TError, BodyType<CreateMindMapBody>, TContext>;
export declare const deleteDeckMindMap: (deckId: number, mapId: number, options?: RequestInit) => Promise<{
    success: boolean;
}>;
export declare const useDeleteDeckMindMap: <TError = ErrorType<unknown>, TContext = unknown>(deckId: number, options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteDeckMindMap>>, TError, number, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteDeckMindMap>>, TError, number, TContext>;
export {};
//# sourceMappingURL=mind-maps.d.ts.map