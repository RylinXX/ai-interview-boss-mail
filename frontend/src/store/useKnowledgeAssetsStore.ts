import { create } from 'zustand';
import request, { getApiErrorMessage } from '../utils/request';

export interface KnowledgeAsset {
  id: string;
  title: string;
  asset_code?: string;
  content_snippet?: string;
  confidence_score?: number;
  evidence_strength_score?: number;
  confidentiality_level?: string;
  review_status?: 'unreviewed' | 'reviewed' | 'needs_revision';
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
  source_type?: string;
  source_id?: string;
  source_name?: string | null;
  source_confidentiality?: string | null;
  tags?: string[];
  industry_tags?: string[];
  business_topic_tags?: string[];
  evidence_type_tags?: string[];
  created_at?: string;
}

export interface ProjectAsset {
  _rowKey: string;
  id?: string;
  name: string;
  candidate_name: string;
  resume_id?: string;
  role?: string;
  business_model?: string;
  problem?: string;
  missing_evidence?: string[];
  landing_ideas?: string[];
  industry_label?: string;
  industry_color?: string;
}

export interface CandidateAsset {
  _rowKey: string;
  candidate_name: string;
  resume_id?: string;
  industry_label?: string;
  analysis?: string;
  source_name?: string;
  capability_tags?: string[];
  fit_score?: number;
  match_score?: number;
}

export interface WorkExperienceAsset {
  _rowKey: string;
  candidate_name: string;
  resume_id?: string;
  company: string;
  department?: string;
  title?: string;
  period?: string;
  description?: string;
  achievement?: string;
  industry_label?: string;
  capability_tags?: string[];
  evidence_strength_score?: number;
}

export interface AssetFilters {
  query?: string;
  industry?: string;
  topic?: string;
  evidenceType?: string;
  reviewStatus?: string;
  sourceType?: string;
}

export interface ChunksCacheValue {
  chunks: KnowledgeAsset[];
  total: number;
  updatedAt: number;
}

export interface TaxonomyData {
  industry_tags: string[];
  business_topic_tags: string[];
  evidence_type_tags: string[];
}

export interface KnowledgeAssetsStore {
  // Store Cache & State
  projects: ProjectAsset[];
  projectsUpdatedAt: number;
  projectsLoading: boolean;
  projectsRefreshing: boolean;
  projectsError: string | null;

  candidates: CandidateAsset[];
  works: WorkExperienceAsset[];
  experienceUpdatedAt: number;
  experienceLoading: boolean;
  experienceRefreshing: boolean;
  experienceError: string | null;

  chunksCache: Record<string, ChunksCacheValue>;
  chunksLoading: boolean;
  chunksRefreshing: boolean;
  chunksError: string | null;

  taxonomy: TaxonomyData;
  taxonomyUpdatedAt: number;

  currentUserId: string | null;

  // Actions
  fetchProjects: (options?: { force?: boolean; userId?: string }) => Promise<void>;
  fetchExperienceSummary: (options?: { force?: boolean; userId?: string }) => Promise<void>;
  fetchChunks: (
    filters: AssetFilters,
    page: number,
    pageSize: number,
    options?: { force?: boolean; userId?: string }
  ) => Promise<void>;
  refreshAll: (
    filters: AssetFilters,
    page: number,
    pageSize: number,
    options?: { force?: boolean; userId?: string }
  ) => Promise<{ success: boolean; errors: string[] }>;
  invalidateCache: () => void;
}

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes cache TTL
const inFlightPromises = new Map<string, Promise<any>>();

const ensureArray = (val: any): string[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val.map((x) => String(x));
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x));
    } catch {
      return val.split(/[,，;\n]/).map((x) => x.trim()).filter(Boolean);
    }
  }
  return [];
};

export const useKnowledgeAssetsStore = create<KnowledgeAssetsStore>((set, get) => ({
  projects: [],
  projectsUpdatedAt: 0,
  projectsLoading: false,
  projectsRefreshing: false,
  projectsError: null,

  candidates: [],
  works: [],
  experienceUpdatedAt: 0,
  experienceLoading: false,
  experienceRefreshing: false,
  experienceError: null,

  chunksCache: {},
  chunksLoading: false,
  chunksRefreshing: false,
  chunksError: null,

  taxonomy: {
    industry_tags: [],
    business_topic_tags: [],
    evidence_type_tags: [],
  },
  taxonomyUpdatedAt: 0,

  currentUserId: null,

  fetchProjects: async (options) => {
    const { force = false, userId = 'default' } = options || {};
    const state = get();
    const now = Date.now();

    // Reset store if user identity changed
    if (state.currentUserId && state.currentUserId !== userId) {
      set({
        currentUserId: userId,
        projects: [],
        projectsUpdatedAt: 0,
        candidates: [],
        works: [],
        experienceUpdatedAt: 0,
        chunksCache: {},
        taxonomyUpdatedAt: 0,
      });
    } else if (!state.currentUserId) {
      set({ currentUserId: userId });
    }

    const isCacheValid =
      !force &&
      state.projects.length > 0 &&
      now - state.projectsUpdatedAt < DEFAULT_TTL;

    if (isCacheValid) {
      return;
    }

    const requestKey = `projects_${userId}`;
    if (inFlightPromises.has(requestKey)) {
      return inFlightPromises.get(requestKey);
    }

    const isInitial = state.projects.length === 0;
    if (isInitial) {
      set({ projectsLoading: true, projectsError: null });
    } else {
      set({ projectsRefreshing: true, projectsError: null });
    }

    const promise = (async () => {
      try {
        const res: any = await request.get('/resumes/project-library', { timeout: 20000 }).catch(() => ({}));
        const rawProjects = Array.isArray(res) ? res : res?.projects || [];
        const mapped: ProjectAsset[] = rawProjects.map((p: any, idx: number) => ({
          _rowKey: p.id || `proj_${idx}_${p.name || ''}`,
          id: p.id,
          name: p.name || p.project_name || '未命名打法案例',
          candidate_name: p.candidate_name || p.owner_name || '内部专家',
          resume_id: p.resume_id || '',
          role: p.role || p.position || '负责人',
          business_model: p.business_model || p.summary || p.description || '',
          problem: p.problem || p.pain_point || '',
          missing_evidence: ensureArray(p.missing_evidence || p.evidence_gaps),
          landing_ideas: ensureArray(p.landing_ideas || p.ideas),
          industry_label: p.industry_label || p.industry || '通用业务',
          industry_color: p.industry_color || 'purple',
        }));

        set({
          projects: mapped,
          projectsUpdatedAt: Date.now(),
          projectsLoading: false,
          projectsRefreshing: false,
          projectsError: null,
        });
      } catch (e: any) {
        const msg = getApiErrorMessage(e, '获取项目打法资产失败');
        set((currentState) => ({
          projectsLoading: false,
          projectsRefreshing: false,
          projectsError: currentState.projects.length > 0 ? null : msg,
        }));
        throw e;
      } finally {
        inFlightPromises.delete(requestKey);
      }
    })();

    inFlightPromises.set(requestKey, promise);
    return promise;
  },

  fetchExperienceSummary: async (options) => {
    const { force = false, userId = 'default' } = options || {};
    const state = get();
    const now = Date.now();

    const isCacheValid =
      !force &&
      (state.candidates.length > 0 || state.works.length > 0) &&
      now - state.experienceUpdatedAt < DEFAULT_TTL;

    if (isCacheValid) {
      return;
    }

    const requestKey = `experience_${userId}`;
    if (inFlightPromises.has(requestKey)) {
      return inFlightPromises.get(requestKey);
    }

    const isInitial = state.candidates.length === 0 && state.works.length === 0;
    if (isInitial) {
      set({ experienceLoading: true, experienceError: null });
    } else {
      set({ experienceRefreshing: true, experienceError: null });
    }

    const promise = (async () => {
      try {
        const summaryRes: any = await request.get('/resumes/experience-summary', { timeout: 30000 }).catch(() => ({}));

        const rawLogic = summaryRes?.logic_analyses || summaryRes?.candidates || [];
        const rawWorks = summaryRes?.work_experiences || [];

        let candList: CandidateAsset[] = rawLogic.map((c: any, idx: number) => {
          const resId = c.resume_id || c.id || '';
          const schoolTags = ensureArray(c.school_tags);
          const companyTags = ensureArray(c.company_tags);
          const explicitTags = ensureArray(c.capability_tags || c.tags);
          const combinedTags = Array.from(new Set([...schoolTags, ...companyTags, ...explicitTags]));

          const finalScore = c.match_score ?? c.fit_score ?? c.score ?? 85;

          return {
            _rowKey: c.id || c.resume_id || `cand_${idx}`,
            candidate_name: c.candidate_name || '专家样本',
            resume_id: resId,
            industry_label: c.industry_label || c.industry || '综合领域',
            analysis: c.analysis || c.summary || c.logic_analysis || '能力论证链完备，具备高复杂场景交付能力',
            source_name: c.source_name || c.current_company || '履历出处',
            capability_tags: combinedTags,
            fit_score: finalScore,
          };
        });

        // Fallback: Only fetch lightweight resumes if logic_analyses is empty
        if (candList.length === 0) {
          const resumeListRes: any = await request.get('/resumes', { params: { limit: 100 } }).catch(() => []);
          const allResumes = Array.isArray(resumeListRes) ? resumeListRes : resumeListRes?.items || [];
          if (allResumes.length > 0) {
            candList = allResumes.map((r: any, idx: number) => {
              const resId = r.id || '';
              const schoolTags = ensureArray(r.school_tags || r.parsed_data?.school_tags);
              const companyTags = ensureArray(r.company_tags || r.parsed_data?.company_tags);
              const skillTags = ensureArray(
                r.parsed_data?.capability_tags ||
                r.parsed_data?.tags ||
                r.parsed_data?.skills ||
                r.capability_tags ||
                r.skills ||
                r.tags
              );
              const tags = Array.from(new Set([...schoolTags, ...companyTags, ...skillTags]));
              const finalScore = r.match_score ?? r.score ?? r.fit_score ?? r.parsed_data?.match_score ?? 88;

              return {
                _rowKey: r.id || `res_${idx}`,
                candidate_name: r.name || r.candidate_name || `专家人选 #${idx + 1}`,
                resume_id: resId,
                industry_label: r.industry || r.target_position || '软件与IT服务',
                analysis: r.summary || (tags.length > 0 ? `核心能力标签: ${tags.join(', ')}` : '简历特征与打法推演已入库'),
                source_name: r.current_company || '履历样本出处',
                capability_tags: tags,
                fit_score: finalScore,
              };
            });
          }
        }

        const workList: WorkExperienceAsset[] = rawWorks.map((w: any, idx: number) => ({
          _rowKey: w.id || `work_${idx}_${w.company || ''}`,
          candidate_name: w.candidate_name || '专家人选',
          resume_id: w.resume_id || '',
          company: w.company || w.organization || '知名企业/机构',
          department: w.department || '业务部门',
          title: w.title || w.role || w.position || '核心岗位',
          period: w.period || w.duration || '近期',
          description: w.description || w.duty || w.summary || '主持完成架构升级与系统能力建设',
          achievement: w.achievement || w.key_result || '交付验证良好',
          industry_label: w.industry_label || '行业经验',
          capability_tags: ensureArray(w.capability_tags || w.capabilities || w.tags),
          evidence_strength_score: w.evidence_strength_score || 88,
        }));

        set({
          candidates: candList,
          works: workList,
          experienceUpdatedAt: Date.now(),
          experienceLoading: false,
          experienceRefreshing: false,
          experienceError: null,
        });
      } catch (e: any) {
        const msg = getApiErrorMessage(e, '获取履历与能力数据失败');
        set((currentState) => ({
          experienceLoading: false,
          experienceRefreshing: false,
          experienceError: (currentState.candidates.length > 0 || currentState.works.length > 0) ? null : msg,
        }));
        throw e;
      } finally {
        inFlightPromises.delete(requestKey);
      }
    })();

    inFlightPromises.set(requestKey, promise);
    return promise;
  },

  fetchChunks: async (filters, page, pageSize, options) => {
    const { force = false, userId = 'default' } = options || {};
    const state = get();
    const now = Date.now();

    const cacheKey = [
      userId,
      filters.query || '',
      filters.industry || '',
      filters.topic || '',
      filters.evidenceType || '',
      filters.reviewStatus || '',
      filters.sourceType || '',
      page,
      pageSize,
    ].join('_');

    const cachedData = state.chunksCache[cacheKey];
    const isChunkCacheValid = !force && cachedData && now - cachedData.updatedAt < DEFAULT_TTL;
    const isTaxonomyCacheValid =
      !force &&
      state.taxonomy.industry_tags.length > 0 &&
      now - state.taxonomyUpdatedAt < DEFAULT_TTL;

    if (isChunkCacheValid && isTaxonomyCacheValid) {
      return;
    }

    const requestKey = `chunks_${cacheKey}`;
    if (inFlightPromises.has(requestKey)) {
      return inFlightPromises.get(requestKey);
    }

    const hasCurrentChunks = !!cachedData;
    if (!hasCurrentChunks) {
      set({ chunksLoading: true, chunksError: null });
    } else {
      set({ chunksRefreshing: true, chunksError: null });
    }

    const promise = (async () => {
      try {
        const [res, taxRes]: [any, any] = await Promise.all([
          request.get('/knowledge-assets/query', {
            params: {
              q: filters.query || undefined,
              industry_tag: filters.industry || undefined,
              topic_tag: filters.topic || undefined,
              evidence_type: filters.evidenceType || undefined,
              review_status: filters.reviewStatus || undefined,
              source_type: filters.sourceType || undefined,
              skip: (page - 1) * pageSize,
              limit: pageSize,
            },
          }),
          isTaxonomyCacheValid
            ? Promise.resolve(null)
            : request.get('/knowledge-assets/taxonomy/stats').catch(() => ({})),
        ]);

        const newChunks: KnowledgeAsset[] = res?.items || [];
        const newTotal = res?.total || 0;

        const nextChunksCache = {
          ...get().chunksCache,
          [cacheKey]: {
            chunks: newChunks,
            total: newTotal,
            updatedAt: Date.now(),
          },
        };

        const nextTaxonomy: TaxonomyData = taxRes
          ? {
              industry_tags: taxRes?.industry_tags?.map((item: any) => item.name) || [],
              business_topic_tags: taxRes?.business_topic_tags?.map((item: any) => item.name) || [],
              evidence_type_tags: taxRes?.evidence_type_tags?.map((item: any) => item.name) || [],
            }
          : get().taxonomy;

        set({
          chunksCache: nextChunksCache,
          taxonomy: nextTaxonomy,
          taxonomyUpdatedAt: taxRes ? Date.now() : get().taxonomyUpdatedAt,
          chunksLoading: false,
          chunksRefreshing: false,
          chunksError: null,
        });
      } catch (e: any) {
        const msg = getApiErrorMessage(e, '获取知识资产切片失败');
        set({
          chunksLoading: false,
          chunksRefreshing: false,
          chunksError: hasCurrentChunks ? null : msg,
        });
        throw e;
      } finally {
        inFlightPromises.delete(requestKey);
      }
    })();

    inFlightPromises.set(requestKey, promise);
    return promise;
  },

  refreshAll: async (filters, page, pageSize, options) => {
    const { userId = 'default' } = options || {};
    const state = get();
    const fetchOps = { force: true, userId };

    const errors: string[] = [];

    const results = await Promise.allSettled([
      state.fetchProjects(fetchOps),
      state.fetchExperienceSummary(fetchOps),
      state.fetchChunks(filters, page, pageSize, fetchOps),
    ]);

    results.forEach((res, index) => {
      if (res.status === 'rejected') {
        const names = ['项目打法资产', '履历与能力矩阵', '文档与知识切片'];
        errors.push(getApiErrorMessage(res.reason, `${names[index]}刷新失败`));
      }
    });

    return {
      success: errors.length === 0,
      errors,
    };
  },

  invalidateCache: () => {
    set({
      projectsUpdatedAt: 0,
      experienceUpdatedAt: 0,
      chunksCache: {},
      taxonomyUpdatedAt: 0,
    });
  },
}));
