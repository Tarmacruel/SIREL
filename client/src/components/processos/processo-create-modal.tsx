import { useEffect, useState, type FormEvent } from "react";
import { CalendarDays, PlusCircle, TimerReset } from "lucide-react";

import { workflowModuleOptions } from "@sirel/shared/const";

import { Modal } from "@/components/shared/modal";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  buildProcessoPayload,
  type ProcessoFormState,
  validateProcessoForm,
} from "@/features/processos/form";
import { trpc } from "@/lib/trpc";
import { mapZodFieldErrors } from "@/lib/zod-errors";

const initialProcessoForm: ProcessoFormState = {
  numeroAdministrativo: "",
  anoReferencia: String(new Date().getFullYear()),
  secretariaId: "",
  modalidadeId: "",
  statusId: "",
  autoridadeCompetenteId: "",
  objeto: "",
  valorEstimado: "",
  escopoDisputa: "GLOBAL",
  criterioJulgamento: "MENOR PRECO",
  modoDisputa: "NAO_SE_APLICA",
  tipoObjeto: "PRODUTO",
  tipoContratacao: "AQUISICAO",
  dataAbertura: "",
  foraDoFluxo: false,
  moduloInicial: "DOCUMENTOS",
};

function buildInitialProcessoForm(
  initialValues?: Partial<ProcessoFormState>,
): ProcessoFormState {
  return {
    ...initialProcessoForm,
    ...initialValues,
  };
}

interface ProcessoCreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (created: { id: number; numeroSirel: string }) => void;
  initialValues?: Partial<ProcessoFormState>;
  title?: string;
  description?: string;
  submitLabel?: string;
}

export function ProcessoCreateModal({
  open,
  onClose,
  onCreated,
  initialValues,
  title = "Novo processo",
  description =
    "Crie processos regulares do fluxo ou registros excepcionais fora do fluxo sem poluir a tela principal.",
  submitLabel = "Salvar processo",
}: ProcessoCreateModalProps) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState<ProcessoFormState>(() =>
    buildInitialProcessoForm(initialValues),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const catalogQuery = trpc.cadastros.formOptions.useQuery(undefined, {
    retry: false,
    enabled: open,
  });

  const createMutation = trpc.processos.create.useMutation({
    onSuccess: async (created) => {
      await Promise.all([
        utils.processos.summary.invalidate(),
        utils.processos.list.invalidate(),
        utils.processos.overview.invalidate(),
        utils.dashboard.summary.invalidate(),
        utils.workflow.summary.invalidate(),
        utils.workflow.list.invalidate(),
        utils.consultas.search.invalidate(),
      ]);
      resetForm();
      onClose();
      onCreated?.(created);
    },
    onError: (error) => {
      setFormError(error.message);
    },
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    setForm(buildInitialProcessoForm(initialValues));
    setFieldErrors({});
    setFormError(null);
  }, [initialValues, open]);

  useEffect(() => {
    if (!open || !catalogQuery.data) {
      return;
    }

    setForm((current) => ({
      ...current,
      secretariaId:
        current.secretariaId || String(catalogQuery.data.secretarias[0]?.id ?? ""),
      modalidadeId:
        current.modalidadeId || String(catalogQuery.data.modalidades[0]?.id ?? ""),
      statusId:
        current.statusId || String(catalogQuery.data.statusProcesso[0]?.id ?? ""),
      autoridadeCompetenteId:
        current.autoridadeCompetenteId || String(catalogQuery.data.pessoas[0]?.id ?? ""),
      moduloInicial:
        current.moduloInicial ||
        String(
          catalogQuery.data.workflowModules.find(
            (item) => item !== "PLANEJAMENTO",
          ) ?? "DOCUMENTOS",
        ),
    }));
  }, [catalogQuery.data, open]);

  function resetForm() {
    setForm(buildInitialProcessoForm(initialValues));
    setFieldErrors({});
    setFormError(null);
  }

  async function handleCreateProcesso(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const parsed = validateProcessoForm(form);
    if (!parsed.success) {
      setFieldErrors(mapZodFieldErrors(parsed.error));
      setFormError("Revise os campos destacados antes de salvar o processo.");
      return;
    }

    setFieldErrors({});
    await createMutation.mutateAsync(buildProcessoPayload(form));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={title}
      description={description}
    >
      <form className="space-y-4" onSubmit={handleCreateProcesso}>
        <Alert variant="info" title="Regras automáticas">
          <ul className="space-y-1">
            <li>Número SIREL gerado automaticamente.</li>
            <li>Número do edital definido apenas na fase de publicidade.</li>
            <li>
              Condutor do processo definido apenas quando o processo for
              publicado.
            </li>
          </ul>
        </Alert>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <FormField label="Ano de referência" error={fieldErrors.anoReferencia}>
            <Input
              required
              type="number"
              min={2020}
              max={2100}
              value={form.anoReferencia}
              error={Boolean(fieldErrors.anoReferencia)}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  anoReferencia: event.target.value,
                }))
              }
            />
          </FormField>
          <FormField
            label="Número administrativo"
            error={fieldErrors.numeroAdministrativo}
          >
            <Input
              value={form.numeroAdministrativo}
              error={Boolean(fieldErrors.numeroAdministrativo)}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  numeroAdministrativo: event.target.value,
                }))
              }
            />
          </FormField>
          <FormField label="Secretaria" error={fieldErrors.secretariaId}>
            <Select
              required
              value={form.secretariaId}
              error={Boolean(fieldErrors.secretariaId)}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  secretariaId: event.target.value,
                }))
              }
            >
              <option value="">Selecione</option>
              {catalogQuery.data?.secretarias.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.sigla} - {item.nome}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Modalidade" error={fieldErrors.modalidadeId}>
            <Select
              value={form.modalidadeId}
              error={Boolean(fieldErrors.modalidadeId)}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  modalidadeId: event.target.value,
                }))
              }
            >
              <option value="">Selecione</option>
              {catalogQuery.data?.modalidades.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <FormField label="Status inicial" error={fieldErrors.statusId}>
            <Select
              value={form.statusId}
              error={Boolean(fieldErrors.statusId)}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  statusId: event.target.value,
                }))
              }
            >
              <option value="">Selecione</option>
              {catalogQuery.data?.statusProcesso.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Valor estimado" error={fieldErrors.valorEstimado}>
            <Input
              value={form.valorEstimado}
              error={Boolean(fieldErrors.valorEstimado)}
              placeholder="0,00"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  valorEstimado: event.target.value,
                }))
              }
            />
          </FormField>
          <FormField
            label="Autoridade competente"
            error={fieldErrors.autoridadeCompetenteId}
          >
            <Select
              value={form.autoridadeCompetenteId}
              error={Boolean(fieldErrors.autoridadeCompetenteId)}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  autoridadeCompetenteId: event.target.value,
                }))
              }
            >
              <option value="">Selecione</option>
              {catalogQuery.data?.pessoas.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                  {item.cargo ? ` - ${item.cargo}` : ""}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Modo de disputa" error={fieldErrors.modoDisputa}>
            <Select
              value={form.modoDisputa}
              error={Boolean(fieldErrors.modoDisputa)}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  modoDisputa: event.target.value,
                }))
              }
            >
              {catalogQuery.data?.modoDisputa.map((item) => (
                <option key={item.codigo} value={item.codigo}>
                  {item.nome}
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <FormField label="Escopo" error={fieldErrors.escopoDisputa}>
            <Select
              value={form.escopoDisputa}
              error={Boolean(fieldErrors.escopoDisputa)}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  escopoDisputa: event.target.value,
                }))
              }
            >
              <option value="GLOBAL">Global</option>
              <option value="LOTE">Lote</option>
              <option value="ITEM">Item</option>
            </Select>
          </FormField>
          <FormField label="Tipo de objeto" error={fieldErrors.tipoObjeto}>
            <Select
              value={form.tipoObjeto}
              error={Boolean(fieldErrors.tipoObjeto)}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  tipoObjeto: event.target.value,
                }))
              }
            >
              <option value="PRODUTO">Produto</option>
              <option value="SERVICO">Serviço</option>
              <option value="OBRA">Obra</option>
              <option value="SERVICO_ENG">Serviço de engenharia</option>
            </Select>
          </FormField>
          <FormField
            label="Tipo de contratação"
            error={fieldErrors.tipoContratacao}
          >
            <Select
              value={form.tipoContratacao}
              error={Boolean(fieldErrors.tipoContratacao)}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  tipoContratacao: event.target.value,
                }))
              }
            >
              <option value="AQUISICAO">Aquisição</option>
              <option value="REGISTRO_PRECO">Registro de preço</option>
              <option value="AQUISICAO_PARCELADA">Aquisição parcelada</option>
            </Select>
          </FormField>
        </div>

        <FormField
          label="Critério de julgamento"
          error={fieldErrors.criterioJulgamento}
        >
          <Input
            value={form.criterioJulgamento}
            error={Boolean(fieldErrors.criterioJulgamento)}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                criterioJulgamento: event.target.value,
              }))
            }
          />
        </FormField>

        <FormField label="Objeto" error={fieldErrors.objeto}>
          <Textarea
            required
            rows={5}
            value={form.objeto}
            error={Boolean(fieldErrors.objeto)}
            onChange={(event) =>
              setForm((current) => ({ ...current, objeto: event.target.value }))
            }
          />
        </FormField>

        <FormField
          label="Data prevista de abertura"
          error={fieldErrors.dataAbertura}
        >
          <div className="flex items-center gap-2 rounded-[18px] border border-[rgba(209,213,219,0.92)] bg-white px-3 py-2.5">
            <CalendarDays className="h-4 w-4 text-[var(--color-neutral-400)]" />
            <input
              type="date"
              value={form.dataAbertura}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  dataAbertura: event.target.value,
                }))
              }
              className="w-full border-none bg-transparent text-sm outline-none"
            />
          </div>
        </FormField>

        <div className="rounded-3xl border border-[rgba(204,225,255,0.88)] bg-[var(--color-primary-50)] px-4 py-4">
          <label className="flex items-start gap-3">
            <Checkbox
              checked={form.foraDoFluxo}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  foraDoFluxo: event.target.checked,
                }))
              }
              className="mt-1"
            />
            <span className="space-y-1">
              <span className="block text-sm font-semibold text-[var(--color-primary-900)]">
                Processo fora do fluxo
              </span>
              <span className="block text-sm text-[var(--color-neutral-600)]">
                Use apenas para casos excepcionais. O sistema manterá essa
                marcação para análise gerencial.
              </span>
            </span>
          </label>
        </div>

        {form.foraDoFluxo ? (
          <FormField
            label="Módulo inicial excepcional"
            error={fieldErrors.moduloInicial}
          >
            <Select
              value={form.moduloInicial}
              error={Boolean(fieldErrors.moduloInicial)}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  moduloInicial: event.target.value,
                }))
              }
            >
              {workflowModuleOptions
                .filter((item) => item !== "PLANEJAMENTO")
                .map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
            </Select>
          </FormField>
        ) : null}

        {formError ? <Alert variant="error">{formError}</Alert> : null}

        <div className="flex flex-wrap justify-end gap-3 border-t border-[rgba(204,225,255,0.92)] pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={resetForm}
            icon={<TimerReset className="h-4 w-4" />}
          >
            Limpar formulário
          </Button>
          <Button
            type="submit"
            loading={createMutation.isPending}
            icon={<PlusCircle className="h-4 w-4" />}
          >
            {createMutation.isPending ? "Salvando processo..." : submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
