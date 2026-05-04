import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from "@tanstack/react-query";
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
export declare const getListQbanksQueryKey: () => readonly ["/api/qbanks"];
export declare const listQbanks: (options?: RequestInit) => Promise<Qbank[]>;
export declare const getListQbanksQueryOptions: <TData = Awaited<ReturnType<typeof listQbanks>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listQbanks>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listQbanks>>, TError, TData> & {
    queryKey: QueryKey;
};
export declare function useListQbanks<TData = Awaited<ReturnType<typeof listQbanks>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listQbanks>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetQbankQueryKey: (id: number) => readonly [`/api/qbanks/${number}`];
export declare const getQbank: (id: number, options?: RequestInit) => Promise<QbankDetail>;
export declare const getGetQbankQueryOptions: <TData = Awaited<ReturnType<typeof getQbank>>, TError = ErrorType<void>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getQbank>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getQbank>>, TError, TData> & {
    queryKey: QueryKey;
};
export declare function useGetQbank<TData = Awaited<ReturnType<typeof getQbank>>, TError = ErrorType<void>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getQbank>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const createQbank: (body: CreateQbankBody, options?: RequestInit) => Promise<Qbank>;
export declare const getCreateQbankMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createQbank>>, TError, {
        data: BodyType<CreateQbankBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createQbank>>, TError, {
    data: BodyType<CreateQbankBody>;
}, TContext>;
export declare function useCreateQbank<TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createQbank>>, TError, {
        data: BodyType<CreateQbankBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}): UseMutationResult<Awaited<ReturnType<typeof createQbank>>, TError, {
    data: BodyType<CreateQbankBody>;
}, TContext>;
export declare const updateQbank: (id: number, body: UpdateQbankBody, options?: RequestInit) => Promise<Qbank>;
export declare const getUpdateQbankMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateQbank>>, TError, {
        id: number;
        data: BodyType<UpdateQbankBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateQbank>>, TError, {
    id: number;
    data: BodyType<UpdateQbankBody>;
}, TContext>;
export declare function useUpdateQbank<TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateQbank>>, TError, {
        id: number;
        data: BodyType<UpdateQbankBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}): UseMutationResult<Awaited<ReturnType<typeof updateQbank>>, TError, {
    id: number;
    data: BodyType<UpdateQbankBody>;
}, TContext>;
export declare const deleteQbank: (id: number, options?: RequestInit) => Promise<void>;
export declare const getDeleteQbankMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteQbank>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteQbank>>, TError, {
    id: number;
}, TContext>;
export declare function useDeleteQbank<TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteQbank>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}): UseMutationResult<Awaited<ReturnType<typeof deleteQbank>>, TError, {
    id: number;
}, TContext>;
export declare const getListQbankQuestionsQueryKey: (id: number) => readonly [`/api/qbanks/${number}/questions`];
export declare const listQbankQuestions: (id: number, options?: RequestInit) => Promise<Question[]>;
export declare const getListQbankQuestionsQueryOptions: <TData = Awaited<ReturnType<typeof listQbankQuestions>>, TError = ErrorType<unknown>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listQbankQuestions>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listQbankQuestions>>, TError, TData> & {
    queryKey: QueryKey;
};
export declare function useListQbankQuestions<TData = Awaited<ReturnType<typeof listQbankQuestions>>, TError = ErrorType<unknown>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listQbankQuestions>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const updateQuestion: (id: number, body: UpdateQuestionBody, options?: RequestInit) => Promise<Question>;
export declare function useUpdateQuestion<TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateQuestion>>, TError, {
        id: number;
        data: BodyType<UpdateQuestionBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}): UseMutationResult<Awaited<ReturnType<typeof updateQuestion>>, TError, {
    id: number;
    data: BodyType<UpdateQuestionBody>;
}, TContext>;
export declare const deleteQuestion: (id: number, options?: RequestInit) => Promise<void>;
export declare function useDeleteQuestion<TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteQuestion>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}): UseMutationResult<Awaited<ReturnType<typeof deleteQuestion>>, TError, {
    id: number;
}, TContext>;
export {};
//# sourceMappingURL=qbanks.d.ts.map