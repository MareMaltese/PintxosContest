<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Camera } from '@lucide/vue';
import Icon from '../components/common/Icon.vue';
import { api, ApiError } from '../services/api';
import { compressImage } from '../services/image';
import { useEntriesStore } from '../stores/entries';

interface CreatedEntryResponse {
  id: string;
  number: number;
  name: string | null;
  description: string | null;
  imagePath: string;
}

const router = useRouter();
const entries = useEntriesStore();

const fileInput = ref<HTMLInputElement | null>(null);
const selectedFile = ref<File | null>(null);
const previewUrl = ref<string | null>(null);
const name = ref('');
const description = ref('');
const touched = ref(false);
const isSubmitting = ref(false);
const submitError = ref<string | null>(null);

function pickPhoto(): void {
  fileInput.value?.click();
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  selectedFile.value = file;
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = file ? URL.createObjectURL(file) : null;
}

async function onSubmit(): Promise<void> {
  touched.value = true;
  if (!selectedFile.value) return;

  isSubmitting.value = true;
  submitError.value = null;
  try {
    let photo = selectedFile.value;
    try {
      photo = await compressImage(selectedFile.value);
    } catch {
      // si la compresión falla, seguimos con el archivo original
    }

    const form = new FormData();
    form.set('image', photo);
    if (name.value.trim()) form.set('name', name.value.trim());
    if (description.value.trim()) form.set('description', description.value.trim());

    const entry = await api.postForm<CreatedEntryResponse>('/api/entries', form);
    entries.setLastCreated(entry);
    router.push({ name: 'entry-confirmation', params: { number: String(entry.number) } });
  } catch (err) {
    submitError.value = err instanceof ApiError ? err.message : 'No hemos podido guardar tu pincho.';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <main class="new-entry">
    <form
      class="new-entry__card"
      @submit.prevent="onSubmit"
    >
      <h1 class="new-entry__title">
        Registra tu pincho
      </h1>
      <p class="new-entry__subtitle">
        Haz la foto ahora mismo, tal cual está.
      </p>

      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        class="new-entry__file-input"
        @change="onFileChange"
      >

      <button
        type="button"
        class="new-entry__photo-picker"
        @click="pickPhoto"
      >
        <img
          v-if="previewUrl"
          :src="previewUrl"
          alt=""
          class="new-entry__preview"
        >
        <span
          v-else
          class="new-entry__photo-placeholder"
        >
          <Camera
            :size="32"
            aria-hidden="true"
          />
          <span>Hacer foto</span>
        </span>
      </button>
      <p
        v-if="touched && !selectedFile"
        class="new-entry__error"
        role="alert"
      >
        Haz una foto de tu pincho para continuar.
      </p>

      <label
        class="new-entry__label"
        for="entry-name"
      >Nombre del pincho (opcional)</label>
      <input
        id="entry-name"
        v-model="name"
        class="new-entry__input"
        type="text"
        placeholder="Por ejemplo: Croqueta de jamón"
        maxlength="80"
      >

      <label
        class="new-entry__label"
        for="entry-description"
      >Descripción (opcional)</label>
      <textarea
        id="entry-description"
        v-model="description"
        class="new-entry__input new-entry__textarea"
        placeholder="Mini brioche de carrillera con cebolla caramelizada."
        maxlength="280"
        rows="3"
      />

      <p
        v-if="submitError"
        class="new-entry__error"
        role="alert"
      >
        {{ submitError }}
      </p>

      <button
        class="button button--primary button--block"
        type="submit"
        :disabled="isSubmitting"
      >
        <Icon
          v-if="!isSubmitting"
          name="plus-circle"
          :size="18"
        />
        {{ isSubmitting ? 'Subiendo tu pincho…' : 'Registrar pincho' }}
      </button>
    </form>
  </main>
</template>

<style scoped>
.new-entry {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
}

.new-entry__card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--space-8) var(--space-5);
  max-width: 420px;
  width: 100%;
}

.new-entry__title {
  font-size: 1.5rem;
  margin: 0 0 var(--space-1);
}

.new-entry__subtitle {
  color: var(--color-text-muted);
  margin: 0 0 var(--space-5);
}

.new-entry__file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

.new-entry__photo-picker {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: var(--radius-md);
  border: 2px dashed var(--color-border);
  background: var(--color-bg);
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  margin-bottom: var(--space-2);
}

.new-entry__preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.new-entry__photo-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
}

.new-entry__label {
  display: block;
  font-weight: 600;
  margin: var(--space-4) 0 var(--space-2);
}

.new-entry__input {
  width: 100%;
  min-height: 48px;
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  font-size: 1rem;
  font-family: inherit;
  margin-bottom: var(--space-2);
}

.new-entry__textarea {
  min-height: 88px;
  resize: vertical;
}

.new-entry__error {
  color: var(--color-danger);
  margin: 0 0 var(--space-4);
  font-size: 0.9rem;
}
</style>
