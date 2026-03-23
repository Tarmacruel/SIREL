import { PNCP_CONFIG } from "./config.js";

export class PNCPClientTeixeira {
  private readonly ORGAO_CNPJ = PNCP_CONFIG.TEIXEIRA_FREITAS.cnpj;

  private async request(path: string) {
    const timeoutMs = Number(process.env.PNCP_API_TIMEOUT ?? 45000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${PNCP_CONFIG.API_BASE}${path}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "SIREL/2.0 (Teixeira de Freitas)",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`PNCP API error: ${response.status} ${response.statusText}`);
      }

      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  async fetchContratacoes({
    dataInicio,
    dataFim,
    pagina = 1,
    tamanhoPagina = 100,
  }: {
    dataInicio?: string;
    dataFim?: string;
    pagina?: number;
    tamanhoPagina?: number;
  }) {
    const params = new URLSearchParams({
      orgaoCnpj: this.ORGAO_CNPJ,
      pagina: String(pagina),
      tamanhoPagina: String(tamanhoPagina),
    });
    if (dataInicio) params.append("dataInicial", dataInicio);
    if (dataFim) params.append("dataFinal", dataFim);

    return await this.request(`/v1/contratacoes?${params.toString()}`);
  }

  async fetchItensContratacao(anoCompra: number, sequencialCompra: number) {
    return await this.request(`/v1/contratacoes/${anoCompra}/${sequencialCompra}/itens`);
  }

  async fetchAtasRegistroPreco({
    dataInicioVigencia,
    dataFimVigencia,
    pagina = 1,
    tamanhoPagina = 100,
  }: {
    dataInicioVigencia?: string;
    dataFimVigencia?: string;
    pagina?: number;
    tamanhoPagina?: number;
  }) {
    const params = new URLSearchParams({
      orgaoGerenciadorCnpj: this.ORGAO_CNPJ,
      pagina: String(pagina),
      tamanhoPagina: String(tamanhoPagina),
    });
    if (dataInicioVigencia) params.append("dataInicioVigencia", dataInicioVigencia);
    if (dataFimVigencia) params.append("dataFimVigencia", dataFimVigencia);

    return await this.request(`/v1/atas?${params.toString()}`);
  }

  async fetchItensAta(idAtaPNCP: string) {
    return await this.request(`/v1/atas/${idAtaPNCP}/itens`);
  }

  async fetchContratos({
    dataAssinaturaInicio,
    dataAssinaturaFim,
    pagina = 1,
    tamanhoPagina = 100,
  }: {
    dataAssinaturaInicio?: string;
    dataAssinaturaFim?: string;
    pagina?: number;
    tamanhoPagina?: number;
  }) {
    const params = new URLSearchParams({
      orgaoCnpj: this.ORGAO_CNPJ,
      pagina: String(pagina),
      tamanhoPagina: String(tamanhoPagina),
    });
    if (dataAssinaturaInicio) params.append("dataAssinaturaInicio", dataAssinaturaInicio);
    if (dataAssinaturaFim) params.append("dataAssinaturaFim", dataAssinaturaFim);

    return await this.request(`/v1/contratos?${params.toString()}`);
  }

  async fetchTermosAditivos(idContratoPNCP: string) {
    return await this.request(`/v1/contratos/${idContratoPNCP}/aditivos`);
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

    // 1. Contratações
    try {
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await this.fetchContratacoes({
          dataInicio,
          dataFim,
          pagina: page,
          tamanhoPagina: 100,
        });

        result.contratacoes.push(...(response.data ?? []));
        hasMore = response.pagina < response.totalPaginas;
        page += 1;
        if (hasMore) await new Promise((resolve) => setTimeout(resolve, PNCP_CONFIG.RATE_LIMIT.delayBetweenPagesMs));
      }
    } catch (error: any) {
      result.errors.push(`Erro contratações: ${error?.message ?? String(error)}`);
    }

    // 2. Itens das contratações
    if (incluirItens) {
      for (const contratacao of result.contratacoes) {
        try {
          if (contratacao.anoCompra && contratacao.sequencialCompra) {
            const itensResponse = await this.fetchItensContratacao(
              Number(contratacao.anoCompra),
              Number(contratacao.sequencialCompra),
            );
            contratacao.itens = itensResponse.data ?? [];
          }
        } catch (error: any) {
          result.errors.push(`Erro itens ${contratacao.numeroControlePNCP}: ${error?.message ?? String(error)}`);
        }
      }
    }

    // 3. Atas de RP
    if (incluirAtas) {
      try {
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const response = await this.fetchAtasRegistroPreco({
            dataInicioVigencia: dataInicio,
            dataFimVigencia: dataFim,
            pagina: page,
            tamanhoPagina: 100,
          });
          result.atas.push(...(response.data ?? []));
          hasMore = response.pagina < response.totalPaginas;
          page += 1;
          if (hasMore) await new Promise((resolve) => setTimeout(resolve, PNCP_CONFIG.RATE_LIMIT.delayBetweenPagesMs));
        }
      } catch (error: any) {
        result.errors.push(`Erro atas: ${error?.message ?? String(error)}`);
      }
    }

    // 4. Contratos
    if (incluirContratos) {
      try {
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const response = await this.fetchContratos({
            dataAssinaturaInicio: dataInicio,
            dataAssinaturaFim: dataFim,
            pagina: page,
            tamanhoPagina: 100,
          });
          result.contratos.push(...(response.data ?? []));
          hasMore = response.pagina < response.totalPaginas;
          page += 1;
          if (hasMore) await new Promise((resolve) => setTimeout(resolve, PNCP_CONFIG.RATE_LIMIT.delayBetweenPagesMs));
        }
      } catch (error: any) {
        result.errors.push(`Erro contratos: ${error?.message ?? String(error)}`);
      }
    }

    return result;
  }
}
