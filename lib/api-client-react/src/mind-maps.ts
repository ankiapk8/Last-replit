import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MutationFunction,
  QueryFunction,
  QueryKey,
  UseMutationOptions,
  UseMutationResult,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query";
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

export const getListDeckMindMapsQueryKey = (deckId: number) =>
  [`/api/decks/${deckId}/mind-maps`] as const;

export const listDeckMindMaps = async (
  deckId: number,
  options?: RequestInit,
): Promise<SavedMindMap[]> =>
  customFetch<SavedMindMap[]>(`/api/decks/${deckId}/mind-maps`, {
    ...options,
    method: "GET",
  });

export const getListDeckMindMapsQueryOptions = <
  TData = Awaited<ReturnType<typeof listDeckMindMaps>>,
  TError = ErrorType<unknown>,
>(
  deckId: number,
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listDeckMindMaps>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getListDeckMindMapsQueryKey(deckId);
  const queryFn: QueryFunction<Awaited<ReturnType<typeof listDeckMindMaps>>> = ({ signal }) =>
    listDeckMindMaps(deckId, { signal, ...requestOptions });
  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof listDeckMindMaps>>,
    TError,
    TData
  > & { queryKey: QueryKey };
};

export const useListDeckMindMaps = <
  TData = Awaited<ReturnType<typeof listDeckMindMaps>>,
  TError = ErrorType<unknown>,
>(
  deckId: number,
  options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listDeckMindMaps>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
  },
): UseQueryResult<TData, TError> & { queryKey: QueryKey } => {
  const queryOptions = getListDeckMindMapsQueryOptions(deckId, options);
  const query = useQuery(queryOptions);
  return { ...query, queryKey: queryOptions.queryKey };
};

export const createDeckMindMap = async (
  deckId: number,
  body: BodyType<CreateMindMapBody>,
  options?: RequestInit,
): Promise<SavedMindMap> =>
  customFetch<SavedMindMap>(`/api/decks/${deckId}/mind-maps`, {
    ...options,
    method: "POST",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(body),
  });

export const useCreateDeckMindMap = <
  TError = ErrorType<unknown>,
  TContext = unknown,
>(
  deckId: number,
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof createDeckMindMap>>,
      TError,
      BodyType<CreateMindMapBody>,
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationResult<
  Awaited<ReturnType<typeof createDeckMindMap>>,
  TError,
  BodyType<CreateMindMapBody>,
  TContext
> => {
  const { mutation: mutationOptions, request: requestOptions } = options ?? {};
  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof createDeckMindMap>>,
    BodyType<CreateMindMapBody>
  > = (body) => createDeckMindMap(deckId, body, requestOptions);
  return useMutation({ mutationFn, ...mutationOptions });
};

export const deleteDeckMindMap = async (
  deckId: number,
  mapId: number,
  options?: RequestInit,
): Promise<{ success: boolean }> =>
  customFetch<{ success: boolean }>(`/api/decks/${deckId}/mind-maps/${mapId}`, {
    ...options,
    method: "DELETE",
  });

export const useDeleteDeckMindMap = <
  TError = ErrorType<unknown>,
  TContext = unknown,
>(
  deckId: number,
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof deleteDeckMindMap>>,
      TError,
      number,
      TContext
    >;
    request?: SecondParameter<typeof customFetch>;
  },
): UseMutationResult<
  Awaited<ReturnType<typeof deleteDeckMindMap>>,
  TError,
  number,
  TContext
> => {
  const { mutation: mutationOptions, request: requestOptions } = options ?? {};
  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof deleteDeckMindMap>>,
    number
  > = (mapId) => deleteDeckMindMap(deckId, mapId, requestOptions);
  return useMutation({ mutationFn, ...mutationOptions });
};
