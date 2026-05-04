import { useMutation, useQuery } from "@tanstack/react-query";
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

export interface Qbank {
  id: number;
  name: string;
  description?: string | null;
  parentId?: number | null;
  questionCount: number;
  createdAt: string;
}

export interface QbankDetail extends Qbank {
  subQbanks: Qbank[];
}

export interface Question {
  id: number;
  qbankId: number;
  front: string;
  back: string;
  choices?: string[] | null;
  correctIndex?: number | null;
  tags?: string | null;
  pageNumber?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateQbankBody {
  name: string;
  description?: string | null;
  parentId?: number | null;
}

export interface UpdateQbankBody {
  name?: string;
  description?: string | null;
  parentId?: number | null;
}

export interface UpdateQuestionBody {
  front?: string;
  back?: string;
  tags?: string | null;
}

export const getListQbanksQueryKey = () => [`/api/qbanks`] as const;

export const listQbanks = async (options?: RequestInit): Promise<Qbank[]> =>
  customFetch<Qbank[]>(`/api/qbanks`, { ...options, method: "GET" });

export const getListQbanksQueryOptions = <
  TData = Awaited<ReturnType<typeof listQbanks>>,
  TError = ErrorType<unknown>,
>(options?: {
  query?: UseQueryOptions<Awaited<ReturnType<typeof listQbanks>>, TError, TData>;
  request?: SecondParameter<typeof customFetch>;
}) => {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getListQbanksQueryKey();
  const queryFn: QueryFunction<Awaited<ReturnType<typeof listQbanks>>> = ({ signal }) =>
    listQbanks({ signal, ...requestOptions });
  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<Awaited<ReturnType<typeof listQbanks>>, TError, TData> & { queryKey: QueryKey };
};

export function useListQbanks<
  TData = Awaited<ReturnType<typeof listQbanks>>,
  TError = ErrorType<unknown>,
>(options?: {
  query?: UseQueryOptions<Awaited<ReturnType<typeof listQbanks>>, TError, TData>;
  request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryOptions = getListQbanksQueryOptions(options);
  const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & { queryKey: QueryKey };
  return { ...query, queryKey: queryOptions.queryKey };
}

export const getGetQbankQueryKey = (id: number) => [`/api/qbanks/${id}`] as const;

export const getQbank = async (id: number, options?: RequestInit): Promise<QbankDetail> =>
  customFetch<QbankDetail>(`/api/qbanks/${id}`, { ...options, method: "GET" });

export const getGetQbankQueryOptions = <
  TData = Awaited<ReturnType<typeof getQbank>>,
  TError = ErrorType<void>,
>(id: number, options?: {
  query?: UseQueryOptions<Awaited<ReturnType<typeof getQbank>>, TError, TData>;
  request?: SecondParameter<typeof customFetch>;
}) => {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getGetQbankQueryKey(id);
  const queryFn: QueryFunction<Awaited<ReturnType<typeof getQbank>>> = ({ signal }) =>
    getQbank(id, { signal, ...requestOptions });
  return { queryKey, queryFn, enabled: !!id, ...queryOptions } as UseQueryOptions<Awaited<ReturnType<typeof getQbank>>, TError, TData> & { queryKey: QueryKey };
};

export function useGetQbank<
  TData = Awaited<ReturnType<typeof getQbank>>,
  TError = ErrorType<void>,
>(id: number, options?: {
  query?: UseQueryOptions<Awaited<ReturnType<typeof getQbank>>, TError, TData>;
  request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryOptions = getGetQbankQueryOptions(id, options);
  const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & { queryKey: QueryKey };
  return { ...query, queryKey: queryOptions.queryKey };
}

export const createQbank = async (body: CreateQbankBody, options?: RequestInit): Promise<Qbank> =>
  customFetch<Qbank>(`/api/qbanks`, {
    ...options, method: "POST",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(body),
  });

export const getCreateQbankMutationOptions = <TError = ErrorType<void>, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<Awaited<ReturnType<typeof createQbank>>, TError, { data: BodyType<CreateQbankBody> }, TContext>;
  request?: SecondParameter<typeof customFetch>;
}): UseMutationOptions<Awaited<ReturnType<typeof createQbank>>, TError, { data: BodyType<CreateQbankBody> }, TContext> => {
  const mutationKey = ["createQbank"];
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && "mutationKey" in options.mutation && options.mutation.mutationKey
      ? options : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined };
  const mutationFn: MutationFunction<Awaited<ReturnType<typeof createQbank>>, { data: BodyType<CreateQbankBody> }> = (props) =>
    createQbank(props.data, requestOptions);
  return { mutationFn, ...mutationOptions };
};

export function useCreateQbank<TError = ErrorType<void>, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<Awaited<ReturnType<typeof createQbank>>, TError, { data: BodyType<CreateQbankBody> }, TContext>;
  request?: SecondParameter<typeof customFetch>;
}): UseMutationResult<Awaited<ReturnType<typeof createQbank>>, TError, { data: BodyType<CreateQbankBody> }, TContext> {
  return useMutation(getCreateQbankMutationOptions(options));
}

export const updateQbank = async (id: number, body: UpdateQbankBody, options?: RequestInit): Promise<Qbank> =>
  customFetch<Qbank>(`/api/qbanks/${id}`, {
    ...options, method: "PATCH",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(body),
  });

export const getUpdateQbankMutationOptions = <TError = ErrorType<void>, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateQbank>>, TError, { id: number; data: BodyType<UpdateQbankBody> }, TContext>;
  request?: SecondParameter<typeof customFetch>;
}): UseMutationOptions<Awaited<ReturnType<typeof updateQbank>>, TError, { id: number; data: BodyType<UpdateQbankBody> }, TContext> => {
  const mutationKey = ["updateQbank"];
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && "mutationKey" in options.mutation && options.mutation.mutationKey
      ? options : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined };
  const mutationFn: MutationFunction<Awaited<ReturnType<typeof updateQbank>>, { id: number; data: BodyType<UpdateQbankBody> }> = (props) =>
    updateQbank(props.id, props.data, requestOptions);
  return { mutationFn, ...mutationOptions };
};

export function useUpdateQbank<TError = ErrorType<void>, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateQbank>>, TError, { id: number; data: BodyType<UpdateQbankBody> }, TContext>;
  request?: SecondParameter<typeof customFetch>;
}): UseMutationResult<Awaited<ReturnType<typeof updateQbank>>, TError, { id: number; data: BodyType<UpdateQbankBody> }, TContext> {
  return useMutation(getUpdateQbankMutationOptions(options));
}

export const deleteQbank = async (id: number, options?: RequestInit): Promise<void> =>
  customFetch<void>(`/api/qbanks/${id}`, { ...options, method: "DELETE" });

export const getDeleteQbankMutationOptions = <TError = ErrorType<void>, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteQbank>>, TError, { id: number }, TContext>;
  request?: SecondParameter<typeof customFetch>;
}): UseMutationOptions<Awaited<ReturnType<typeof deleteQbank>>, TError, { id: number }, TContext> => {
  const mutationKey = ["deleteQbank"];
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && "mutationKey" in options.mutation && options.mutation.mutationKey
      ? options : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined };
  const mutationFn: MutationFunction<Awaited<ReturnType<typeof deleteQbank>>, { id: number }> = (props) =>
    deleteQbank(props.id, requestOptions);
  return { mutationFn, ...mutationOptions };
};

export function useDeleteQbank<TError = ErrorType<void>, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteQbank>>, TError, { id: number }, TContext>;
  request?: SecondParameter<typeof customFetch>;
}): UseMutationResult<Awaited<ReturnType<typeof deleteQbank>>, TError, { id: number }, TContext> {
  return useMutation(getDeleteQbankMutationOptions(options));
}

export const getListQbankQuestionsQueryKey = (id: number) => [`/api/qbanks/${id}/questions`] as const;

export const listQbankQuestions = async (id: number, options?: RequestInit): Promise<Question[]> =>
  customFetch<Question[]>(`/api/qbanks/${id}/questions`, { ...options, method: "GET" });

export const getListQbankQuestionsQueryOptions = <
  TData = Awaited<ReturnType<typeof listQbankQuestions>>,
  TError = ErrorType<unknown>,
>(id: number, options?: {
  query?: UseQueryOptions<Awaited<ReturnType<typeof listQbankQuestions>>, TError, TData>;
  request?: SecondParameter<typeof customFetch>;
}) => {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getListQbankQuestionsQueryKey(id);
  const queryFn: QueryFunction<Awaited<ReturnType<typeof listQbankQuestions>>> = ({ signal }) =>
    listQbankQuestions(id, { signal, ...requestOptions });
  return { queryKey, queryFn, enabled: !!id, ...queryOptions } as UseQueryOptions<Awaited<ReturnType<typeof listQbankQuestions>>, TError, TData> & { queryKey: QueryKey };
};

export function useListQbankQuestions<
  TData = Awaited<ReturnType<typeof listQbankQuestions>>,
  TError = ErrorType<unknown>,
>(id: number, options?: {
  query?: UseQueryOptions<Awaited<ReturnType<typeof listQbankQuestions>>, TError, TData>;
  request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryOptions = getListQbankQuestionsQueryOptions(id, options);
  const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & { queryKey: QueryKey };
  return { ...query, queryKey: queryOptions.queryKey };
}

export const updateQuestion = async (id: number, body: UpdateQuestionBody, options?: RequestInit): Promise<Question> =>
  customFetch<Question>(`/api/questions/${id}`, {
    ...options, method: "PATCH",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(body),
  });

export function useUpdateQuestion<TError = ErrorType<void>, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateQuestion>>, TError, { id: number; data: BodyType<UpdateQuestionBody> }, TContext>;
  request?: SecondParameter<typeof customFetch>;
}): UseMutationResult<Awaited<ReturnType<typeof updateQuestion>>, TError, { id: number; data: BodyType<UpdateQuestionBody> }, TContext> {
  return useMutation({
    mutationKey: ["updateQuestion"],
    mutationFn: (props) => updateQuestion(props.id, props.data, options?.request),
    ...options?.mutation,
  });
}

export const deleteQuestion = async (id: number, options?: RequestInit): Promise<void> =>
  customFetch<void>(`/api/questions/${id}`, { ...options, method: "DELETE" });

export function useDeleteQuestion<TError = ErrorType<void>, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteQuestion>>, TError, { id: number }, TContext>;
  request?: SecondParameter<typeof customFetch>;
}): UseMutationResult<Awaited<ReturnType<typeof deleteQuestion>>, TError, { id: number }, TContext> {
  return useMutation({
    mutationKey: ["deleteQuestion"],
    mutationFn: (props) => deleteQuestion(props.id, options?.request),
    ...options?.mutation,
  });
}
