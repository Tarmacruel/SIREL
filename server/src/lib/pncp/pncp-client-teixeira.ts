import { PNCP_CONFIG } from "./config.js";

type ParsedControle = {
  cnpj: string;
  ano: number;
  sequencial: number;
  sufixo?: number | null;
};

type PagedPayload = {
  data?: any[];
  totalRegistros?: number;
  totalPaginas?: number;
  numeroPagina?: number;
  pagina?: number;
};

export class PNCPClientTeixeira {
  private readonly ORGAO_CNPJ = PNCP_CONFIG.TEIXEIRA_FREITAS.cnpj;
  private readonly requestDelayMs = Math.max(
    PNCP_CONFIG.RATE_LIMIT.delayBetweenPagesMs,
    Math.ceil(
      60000 / Math.max(Number(PNCP_CONFIG.RATE_LIMIT.requestsPerMinute || 1), 1),
    ),
  );

  private normalizeDate(value?: string) {
    if (!value) return undefined;
    const trimmed = String(value).trim();
    if (/^\d{8}$/.test(trimmed)) return trimmed;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed.replace(/-/g, "");
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return undefined;
    return parsed.toISOString().slice(0, 10).replace(/-/g, "");
  }

  private parseControlePNCP(value: unknown): ParsedControle | null {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    // Padrão comum:
    // CNPJ-tipo-SEQUENCIAL/ANO            (compras)
    // CNPJ-tipo-SEQUENCIAL/ANO-SUFIXO     (atas e variações)
    const match = raw.match(/^(\d{14})-\d+-(\d+)\/(\d{4})(?:-(\d+))?$/);
    if (!match) return null;
    const cnpj = match[1];
    const sequencial = Number(match[2]);
    const ano = Number(match[3]);
    const sufixo = match[4] ? Number(match[4]) : null;
    if (!cnpj || !Number.isFinite(sequencial) || !Number.isFinite(ano)) {
      return null;
    }
    return {
      cnpj,
      ano,
      sequencial,
      sufixo: Number.isFinite(sufixo) ? sufixo : null,
    };
  }

  private toDataArray(payload: unknown): any[] {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === "object") {
      const typed = payload as Record<string, unknown>;
      if (Array.isArray(typed.data)) return typed.data as any[];
      if (Array.isArray(typed.itens)) return typed.itens as any[];
      if (Array.isArray(typed.items)) return typed.items as any[];
      if (Array.isArray(typed.resultado)) return typed.resultado as any[];
      if (Array.isArray(typed.resultados)) return typed.resultados as any[];
      if (Array.isArray(typed.content)) return typed.content as any[];
    }
    return [];
  }

  private getPaging(payload: unknown, fallbackPage = 1) {
    const typed = (payload ?? {}) as PagedPayload;
    const totalPages = Number(typed.totalPaginas ?? 1);
    const pageNumber = Number(typed.numeroPagina ?? typed.pagina ?? fallbackPage);
    return {
      totalPages: Number.isFinite(totalPages) && totalPages > 0 ? totalPages : 1,
      pageNumber: Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : fallbackPage,
    };
  }

  private async waitRateLimit(multiplier = 1) {
    const delay = Math.max(0, Math.floor(this.requestDelayMs * multiplier));
    if (!delay) return;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  private async request(path: string, baseUrl: string = PNCP_CONFIG.API_BASE) {
    const timeoutMs = Number(process.env.PNCP_API_TIMEOUT ?? 45000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "SIREL/2.0 (Teixeira de Freitas)",
        },
        signal: controller.signal,
      });

      if (response.status === 204) {
        return {
          data: [],
          totalRegistros: 0,
          totalPaginas: 0,
          numeroPagina: 1,
        };
      }

      if (!response.ok) {
        let details = "";
        try {
          details = (await response.text()).slice(0, 600);
        } catch {
          details = "";
        }
        throw new Error(
          `PNCP API error: ${response.status} ${response.statusText}${details ? ` - ${details}` : ""}`,
        );
      }

      const text = await response.text();
      if (!text) {
        return {
          data: [],
          totalRegistros: 0,
          totalPaginas: 0,
          numeroPagina: 1,
        };
      }

      try {
        return JSON.parse(text);
      } catch {
        return {
          data: [],
          totalRegistros: 0,
          totalPaginas: 0,
          numeroPagina: 1,
        };
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  async fetchContratacoes({
    dataInicio,
    dataFim,
    pagina = 1,
    tamanhoPagina = 100,
    modalidadeCodigos,
    paginateAll = true,
  }: {
    dataInicio?: string;
    dataFim?: string;
    pagina?: number;
    tamanhoPagina?: number;
    modalidadeCodigos?: number[];
    paginateAll?: boolean;
  }) {
    const normalizedInicio = this.normalizeDate(dataInicio);
    const normalizedFim = this.normalizeDate(dataFim);
    const modalidades =
      modalidadeCodigos?.length ? modalidadeCodigos : PNCP_CONFIG.MODALIDADE_CODIGOS;
    const pageSize = Math.min(Math.max(tamanhoPagina, 10), 50);

    const merged: any[] = [];
    const seen = new Set<string>();
    let total = 0;

    for (const codigo of modalidades) {
      let currentPage = pagina;
      let hasMore = true;

      while (hasMore) {
        const params = new URLSearchParams({
          codigoModalidadeContratacao: String(codigo),
          pagina: String(currentPage),
          tamanhoPagina: String(pageSize),
        });
        if (normalizedInicio) params.append("dataInicial", normalizedInicio);
        if (normalizedFim) params.append("dataFinal", normalizedFim);
        params.append("cnpj", this.ORGAO_CNPJ);

        let response: any;
        try {
          response = await this.request(
            `/v1/contratacoes/publicacao?${params.toString()}`,
          );
        } catch {
          // Falha pontual por modalidade não deve interromper todo o preview/import.
          break;
        }

        const data = this.toDataArray(response);
        if (currentPage === 1 && Number.isFinite(response?.totalRegistros)) {
          total += Number(response.totalRegistros);
        }

        for (const item of data) {
          const key =
            item.numeroControlePNCP ?? item.numeroControlePncp ?? JSON.stringify(item);
          if (!seen.has(key)) {
            seen.add(key);
            merged.push(item);
          }
        }

        const { totalPages, pageNumber } = this.getPaging(response, currentPage);
        hasMore = paginateAll && pageNumber < totalPages;
        currentPage += 1;

        if (hasMore) {
          await this.waitRateLimit();
        }
      }
    }

    return {
      data: merged,
      total,
      numeroPagina: 1,
      totalPaginas: 1,
    };
  }

  async fetchItensContratacao(
    anoCompra: number,
    sequencialCompra: number,
    cnpjOrgao: string = this.ORGAO_CNPJ,
  ) {
    const path = `/v1/orgaos/${cnpjOrgao}/compras/${anoCompra}/${sequencialCompra}/itens`;
    let response: any;
    try {
      response = await this.request(path, PNCP_CONFIG.API_BASE_PNCP);
    } catch {
      // Fallback para ambientes onde o endpoint de itens também responde em /api/consulta.
      response = await this.request(path, PNCP_CONFIG.API_BASE);
    }

    const data = this.toDataArray(response);
    return {
      data,
      detalhe: null,
    };
  }

  private async fetchItensContratacaoWithRetry(
    anoCompra: number,
    sequencialCompra: number,
    cnpjOrgao: string = this.ORGAO_CNPJ,
    maxRetries = 5,
  ) {
    let attempt = 0;
    while (true) {
      try {
        return await this.fetchItensContratacao(anoCompra, sequencialCompra, cnpjOrgao);
      } catch (error: any) {
        attempt += 1;
        const message = String(error?.message ?? error ?? "");
        const shouldRetry =
          attempt <= maxRetries &&
          (message.includes("429") ||
            message.includes("503") ||
            message.includes("502") ||
            message.includes("504") ||
            message.includes("aborted"));
        if (!shouldRetry) throw error;
        await this.waitRateLimit(Math.min(2 + attempt, 8));
      }
    }
  }

  async fetchAtasRegistroPreco({
    dataInicioVigencia,
    dataFimVigencia,
    dataInicio,
    dataFim,
    pagina = 1,
    tamanhoPagina = 100,
  }: {
    dataInicioVigencia?: string;
    dataFimVigencia?: string;
    dataInicio?: string;
    dataFim?: string;
    pagina?: number;
    tamanhoPagina?: number;
  }) {
    const normalizedInicio = this.normalizeDate(
      dataInicioVigencia ?? dataInicio,
    );
    const normalizedFim = this.normalizeDate(dataFimVigencia ?? dataFim);
    const params = new URLSearchParams({
      pagina: String(pagina),
      tamanhoPagina: String(Math.max(tamanhoPagina, 10)),
    });
    if (normalizedInicio) params.append("dataInicial", normalizedInicio);
    if (normalizedFim) params.append("dataFinal", normalizedFim);
    params.append("cnpj", this.ORGAO_CNPJ);
    return await this.request(`/v1/atas?${params.toString()}`);
  }

  async fetchAtasDaCompra(
    anoCompra: number,
    sequencialCompra: number,
    cnpjOrgao: string = this.ORGAO_CNPJ,
  ) {
    const response = await this.request(
      `/v1/orgaos/${cnpjOrgao}/compras/${anoCompra}/${sequencialCompra}/atas`,
      PNCP_CONFIG.API_BASE_PNCP,
    );
    return {
      data: this.toDataArray(response),
      raw: response,
    };
  }

  async fetchDetalheAta(
    anoCompra: number,
    sequencialCompra: number,
    sequencialAta: number,
    cnpjOrgao: string = this.ORGAO_CNPJ,
  ) {
    return await this.request(
      `/v1/orgaos/${cnpjOrgao}/compras/${anoCompra}/${sequencialCompra}/atas/${sequencialAta}`,
      PNCP_CONFIG.API_BASE_PNCP,
    );
  }

  async fetchContratos({
    dataAssinaturaInicio,
    dataAssinaturaFim,
    dataInicio,
    dataFim,
    pagina = 1,
    tamanhoPagina = 100,
  }: {
    dataAssinaturaInicio?: string;
    dataAssinaturaFim?: string;
    dataInicio?: string;
    dataFim?: string;
    pagina?: number;
    tamanhoPagina?: number;
  }) {
    const normalizedInicio = this.normalizeDate(
      dataAssinaturaInicio ?? dataInicio,
    );
    const normalizedFim = this.normalizeDate(dataAssinaturaFim ?? dataFim);
    const params = new URLSearchParams({
      pagina: String(pagina),
      tamanhoPagina: String(Math.max(tamanhoPagina, 10)),
    });
    if (normalizedInicio) params.append("dataInicial", normalizedInicio);
    if (normalizedFim) params.append("dataFinal", normalizedFim);
    params.append("cnpjOrgao", this.ORGAO_CNPJ);
    return await this.request(`/v1/contratos?${params.toString()}`);
  }

  async fetchTermosContrato(
    anoContrato: number,
    sequencialContrato: number,
    cnpjOrgao: string = this.ORGAO_CNPJ,
  ) {
    const response = await this.request(
      `/v1/orgaos/${cnpjOrgao}/contratos/${anoContrato}/${sequencialContrato}/termos`,
      PNCP_CONFIG.API_BASE_PNCP,
    );
    return {
      data: this.toDataArray(response),
      raw: response,
    };
  }

  private async fetchTermosContratoWithRetry(
    anoContrato: number,
    sequencialContrato: number,
    cnpjOrgao: string = this.ORGAO_CNPJ,
    maxRetries = 5,
  ) {
    let attempt = 0;
    while (true) {
      try {
        return await this.fetchTermosContrato(
          anoContrato,
          sequencialContrato,
          cnpjOrgao,
        );
      } catch (error: any) {
        attempt += 1;
        const message = String(error?.message ?? error ?? "");
        const shouldRetry =
          attempt <= maxRetries &&
          (message.includes("429") ||
            message.includes("503") ||
            message.includes("502") ||
            message.includes("504") ||
            message.includes("aborted"));
        if (!shouldRetry) throw error;
        await this.waitRateLimit(Math.min(2 + attempt, 8));
      }
    }
  }

  async fetchAllDataTeixeiraFreitas({
    dataInicio,
    dataFim,
    incluirItens = true,
    incluirAtas = true,
    incluirContratos = true,
  }: {
    dataInicio: string;
    dataFim: string;
    incluirItens?: boolean;
    incluirAtas?: boolean;
    incluirContratos?: boolean;
  }) {
    const result: {
      contratacoes: any[];
      atas: any[];
      contratos: any[];
      errors: string[];
    } = {
      contratacoes: [],
      atas: [],
      contratos: [],
      errors: [],
    };

    // 1) Contratações (já traz todas modalidades/páginas internamente)
    try {
      const response = await this.fetchContratacoes({
        dataInicio,
        dataFim,
        pagina: 1,
        tamanhoPagina: 100,
        paginateAll: true,
      });
      result.contratacoes.push(...(response.data ?? []));
    } catch (error: any) {
      result.errors.push(`Erro contratações: ${error?.message ?? String(error)}`);
    }

    // 2) Atas de RP
    if (incluirAtas) {
      try {
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const response = await this.fetchAtasRegistroPreco({
            dataInicio,
            dataFim,
            pagina: page,
            tamanhoPagina: 100,
          });
          result.atas.push(...this.toDataArray(response));
          const { totalPages, pageNumber } = this.getPaging(response, page);
          hasMore = pageNumber < totalPages;
          page += 1;
          if (hasMore) await this.waitRateLimit();
        }
      } catch (error: any) {
        result.errors.push(`Erro atas: ${error?.message ?? String(error)}`);
      }
    }

    // 3) Contratos
    if (incluirContratos) {
      try {
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const response = await this.fetchContratos({
            dataInicio,
            dataFim,
            pagina: page,
            tamanhoPagina: 100,
          });
          result.contratos.push(...this.toDataArray(response));
          const { totalPages, pageNumber } = this.getPaging(response, page);
          hasMore = pageNumber < totalPages;
          page += 1;
          if (hasMore) await this.waitRateLimit();
        }
      } catch (error: any) {
        result.errors.push(`Erro contratos: ${error?.message ?? String(error)}`);
      }
    }

    const itensCompraCache = new Map<string, any[]>();

    // 4) Itens das contratações
    if (incluirItens) {
      for (const contratacao of result.contratacoes) {
        try {
          const anoCompra = Number(contratacao.anoCompra ?? 0);
          const sequencialCompra = Number(contratacao.sequencialCompra ?? 0);
          const cnpjOrgao =
            String(
              contratacao.orgaoEntidade?.cnpj ??
                contratacao.orgaoEntidadeCnpj ??
                this.ORGAO_CNPJ,
            ).replace(/[^\d]+/g, "") || this.ORGAO_CNPJ;

          if (Number.isFinite(anoCompra) && Number.isFinite(sequencialCompra) && anoCompra > 0 && sequencialCompra > 0) {
            const itensResponse = await this.fetchItensContratacaoWithRetry(
              anoCompra,
              sequencialCompra,
              cnpjOrgao,
            );
            const compraKey = `${cnpjOrgao}-${anoCompra}-${sequencialCompra}`;
            const itens = itensResponse.data ?? [];
            itensCompraCache.set(compraKey, itens);
            contratacao.itens = itens;
            contratacao.detalhe = itensResponse.detalhe ?? null;
            await this.waitRateLimit();
          } else {
            contratacao.itens = [];
          }
        } catch (error: any) {
          result.errors.push(
            `Erro itens ${contratacao.numeroControlePNCP ?? contratacao.numeroControlePncp ?? "sem número"}: ${error?.message ?? String(error)}`,
          );
          contratacao.itens = [];
        }
      }
    }

    // 5) Atas: enriquecer detalhes e itens (fallback por itens da compra)
    if (incluirAtas) {
      const atasCompraCache = new Map<string, any[]>();
      for (const ata of result.atas) {
        try {
          const controleCompra =
            ata.numeroControlePNCPCompra ??
            ata.numeroControlePncpCompra ??
            null;
          const controleAta =
            ata.numeroControlePNCPAta ??
            ata.numeroControlePNCP ??
            ata.numeroControlePncp ??
            ata.idAtaPNCP ??
            ata.idAtaPncp ??
            null;

          const parsedCompra = this.parseControlePNCP(controleCompra);
          const parsedAta = this.parseControlePNCP(controleAta);
          const parsed = parsedCompra ?? parsedAta;
          if (!parsed) {
            ata.itens = [];
            continue;
          }

          const compraKey = `${parsed.cnpj}-${parsed.ano}-${parsed.sequencial}`;
          let atasCompra = atasCompraCache.get(compraKey);
          if (!atasCompra) {
            const atasCompraResponse = await this.fetchAtasDaCompra(
              parsed.ano,
              parsed.sequencial,
              parsed.cnpj,
            );
            atasCompra = atasCompraResponse.data ?? [];
            atasCompraCache.set(compraKey, atasCompra);
            await this.waitRateLimit();
          }

          const controleAtaNorm = String(controleAta ?? "").trim();
          const ataDaCompra =
            atasCompra.find(
              (item) =>
                String(item.numeroControlePNCP ?? "").trim() === controleAtaNorm,
            ) ??
            (Number.isFinite(parsedAta?.sufixo) && (parsedAta?.sufixo ?? 0) > 0
              ? atasCompra.find(
                  (item) => Number(item.sequencialAta ?? 0) === Number(parsedAta?.sufixo),
                )
              : null) ??
            null;

          const sequencialAta = Number(
            ataDaCompra?.sequencialAta ?? parsedAta?.sufixo ?? 0,
          );

          let detalheAta: any = null;
          if (Number.isFinite(sequencialAta) && sequencialAta > 0) {
            try {
              detalheAta = await this.fetchDetalheAta(
                parsed.ano,
                parsed.sequencial,
                sequencialAta,
                parsed.cnpj,
              );
              await this.waitRateLimit();
            } catch (error: any) {
              result.errors.push(
                `Erro detalhe ata ${controleAtaNorm || "sem número"}: ${error?.message ?? String(error)}`,
              );
            }
          }

          const itensDetalhe = Array.isArray(detalheAta?.itens)
            ? detalheAta.itens
            : [];

          let itensCompra = itensCompraCache.get(compraKey);
          if (!itensCompra && incluirItens) {
            try {
              const itensResponse = await this.fetchItensContratacaoWithRetry(
                parsed.ano,
                parsed.sequencial,
                parsed.cnpj,
              );
              itensCompra = itensResponse.data ?? [];
              itensCompraCache.set(compraKey, itensCompra);
              await this.waitRateLimit();
            } catch (error: any) {
              result.errors.push(
                `Erro itens compra da ata ${controleAtaNorm || "sem número"}: ${error?.message ?? String(error)}`,
              );
            }
          }

          ata.detalhe = detalheAta ?? ataDaCompra ?? null;
          ata.sequencialAta = sequencialAta || ata.sequencialAta || null;
          ata.itens = itensDetalhe.length ? itensDetalhe : itensCompra ?? [];
        } catch (error: any) {
          result.errors.push(
            `Erro processamento ata ${ata.numeroControlePNCPAta ?? ata.numeroControlePNCP ?? ata.idAtaPNCP ?? "sem número"}: ${error?.message ?? String(error)}`,
          );
          ata.itens = [];
        }
      }
    }

    // 6) Contratos: carregar termos/aditivos
    if (incluirContratos) {
      for (const contrato of result.contratos) {
        try {
          let anoContrato = Number(contrato.anoContrato ?? 0);
          let sequencialContrato = Number(contrato.sequencialContrato ?? 0);
          const controleContrato =
            contrato.numeroControlePNCP ??
            contrato.numeroControlePncp ??
            contrato.idContratoPNCP ??
            contrato.idContratoPncp ??
            null;
          const parsed = this.parseControlePNCP(controleContrato);
          if ((!anoContrato || !sequencialContrato) && parsed) {
            anoContrato = parsed.ano;
            sequencialContrato = parsed.sequencial;
          }

          const cnpjOrgao =
            String(
              contrato.orgaoEntidade?.cnpj ??
                contrato.cnpjOrgao ??
                parsed?.cnpj ??
                this.ORGAO_CNPJ,
            ).replace(/[^\d]+/g, "") || this.ORGAO_CNPJ;

          if (
            Number.isFinite(anoContrato) &&
            Number.isFinite(sequencialContrato) &&
            anoContrato > 0 &&
            sequencialContrato > 0
          ) {
            const termosResponse = await this.fetchTermosContratoWithRetry(
              anoContrato,
              sequencialContrato,
              cnpjOrgao,
            );
            const termos = termosResponse.data ?? [];
            contrato.termos = termos;
            contrato.aditivos = termos.filter((termo) => {
              const tipo = String(
                termo?.tipoTermoContratoNome ??
                  termo?.tipoTermoAditivo ??
                  termo?.tipoAditivo ??
                  "",
              )
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase();
              return (
                tipo.includes("aditivo") ||
                termo?.qualificacaoAcrescimoSupressao === true ||
                termo?.qualificacaoVigencia === true ||
                termo?.qualificacaoFornecedor === true ||
                termo?.qualificacaoReajuste === true
              );
            });
            await this.waitRateLimit();
          } else {
            contrato.termos = [];
            contrato.aditivos = [];
          }
        } catch (error: any) {
          result.errors.push(
            `Erro termos contrato ${contrato.numeroControlePNCP ?? contrato.idContratoPNCP ?? contrato.numeroContratoEmpenho ?? "sem número"}: ${error?.message ?? String(error)}`,
          );
          contrato.termos = [];
          contrato.aditivos = [];
        }
      }
    }

    return result;
  }
}
