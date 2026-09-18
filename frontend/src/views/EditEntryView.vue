<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Camera, X } from '@lucide/vue';
import Icon from '../components/common/Icon.vue';
import { ApiError } from '../services/api';
import { compressImage } from '../services/image';
import { useEntriesStore } from '../stores/entries';

const route = useRoute();
const router = useRouter();
const entries = useEntriesStore();

const fileInput = ref<HTMLInputElement | null>(null);
const selectedFile = ref<File | null>(null);
const objectUrl = ref<string | null>(null);
const name = ref('');
const description = ref('');
const isSubmitting = ref(false);
const submitError = ref<string | null>(null);
const filled = ref(false);

const entry = computed(() => entries.myList.find((e) => e.id === route.params.id) ?? null);

const previewUrl = computed(() => {
  if (objectUrl.value) return objectUrl.value;
  return entry.value ? `/uploads/${entry.value.imagePath}` : null;
});

watch(
  entry,
  (value) => {
    if (value && !filled.value) {
      name.value = value.name ?? '';
      description.value = value.description ?? '';
      filled.value = true;
    }
  },
  { immediate: true }
);

function pickPhoto(): void {
  fileInput.value?.click();
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  selectedFile.value = file;
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value);
  objectUrl.value = file ? URL.createObjectURL(file) : null;
}

onBeforeUnmount(() => {
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value);
});

function cancel(): void {
  router.push({ name: 'my-entries' });
}

async function onSubmit(): Promise<void> {
  if (!entry.value) return;

  isSubmitting.value = true;
  submitError.value = null;
  try {
    const form = new FormData();
    form.set('name', name.value.trim());
    form.set('description', description.value.trim());
    if (selectedFile.value) {
      let photo = selectedFile.value;
      try {
        photo = await compressImage(selectedFile.value);
      } catch {
        // si la compresión falla, seguimos con el archivo original
      }
      form.set('image', photo);
    }

    await entries.updateMine(entry.value.id, form);
    router.push({ name: 'my-entries' });
  } catch (err) {
    submitError.value = err instanceof ApiError ? err.message : 'No hemos podido guardar los cambios.';
  } finally {
    isSubmitting.value = false;
  }
}

onMounted(() => {
  entries.fetchMine();
});
</script>

<template>
  <main class="edit-entry">
    <form
      class="edit-entry__card"
      @submit.prevent="onSubmit"
    >
      <h1 class="edit-entry__title">
        Editar pincho
      </h1>

      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        class="edit-entry__file-input"
        @change="onFileChange"
      >

      <button
        type="button"
        class="edit-entry__photo-picker"
        @click="pickPhoto"
      >
        <img
          v-if="previewUrl"
          :src="previewUrl"
          alt=""
          class="edit-entry__preview"
        >
        <span
          v-else
          class="edit-entry__photo-placeholder"
        >
          <Camera
            :size="32"
            aria-hidden="true"
          />
          <span>Hacer foto</span>
        </span>
      </button>

      <label
        class="edit-entry__label"
        for="entry-name"
      >Nombre del pincho (opcional)</label>
      <input
        id="entry-name"
        v-model="name"
        class="edit-entry__input"
        type="text"
        maxlength="80"
      >

      <label
        class="edit-entry__label"
        for="entry-description"
      >Descripción (opcional)</label>
      <textarea
        id="entry-description"
        v-model="description"
        class="edit-entry__input edit-entry__textarea"
        maxlength="280"
        rows="3"
      />

      <p
        v-if="submitError"
        class="edit-entry__error"
        role="alert"
      >
        {{ submitError }}
      </p>

      <div class="edit-entry__actions">
        <button
          type="button"
          class="button button--secondary button--block edit-entry__cancel"
          @click="cancel"
        >
          <X
            :size="20"
            aria-hidden="true"
          />
          Cancelar
        </button>
        <button
          class="button button--primary button--block edit-entry__submit"
          type="submit"
          :disabled="isSubmitting"
        >
          <Icon
            v-if="!isSubmitting"
            name="check"
            :size="20"
          />
          {{ isSubmitting ? 'Guardando…' : 'Guardar' }}
        </button>
      </div>
    </form>
  </main>
</template>

<style scoped>
.edit-entry {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
}

.edit-entry__card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--space-8) var(--space-5);
  max-width: 420px;
  width: 100%;
}

.edit-entry__title {
  font-size: 1.5rem;
  margin: 0 0 var(--space-5);
}

.edit-entry__file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

.edit-entry__photo-picker {
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

.edit-entry__preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.edit-entry__photo-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
}

.edit-entry__label {
  display: block;
  font-weight: 600;
  margin: var(--space-4) 0 var(--space-2);
}

.edit-entry__input {
  width: 100%;
  min-height: 48px;
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  font-size: 1rem;
  font-family: inherit;
  margin-bottom: var(--space-2);
}

.edit-entry__textarea {
  min-height: 88px;
  resize: vertical;
}

.edit-entry__error {
  color: var(--color-danger);
  margin: 0 0 var(--space-4);
  font-size: 0.9rem;
}

.edit-entry__actions {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-4);
}

.edit-entry__submit,
.edit-entry__cancel {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
}
</style>
