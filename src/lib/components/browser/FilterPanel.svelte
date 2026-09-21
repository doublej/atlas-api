<script lang="ts">
import { frameworkColor, typeColor } from '$lib/browser/colors'
import { type PromotionFilter, toggleSet } from '$lib/browser/filters'
import Card from '$lib/components/ui/Card.svelte'
import Chip from '$lib/components/ui/Chip.svelte'
import type { Framework } from '$lib/scanner'

interface Props {
  types: string[]
  frameworks: Framework[]
  runners: string[]
  hosts: string[]
  showTools: boolean
  selectedTypes: Set<string>
  selectedFrameworks: Set<Framework>
  selectedRunners: Set<string>
  selectedHosts: Set<string>
  selectedTools: Set<string>
  onlyWithDev: boolean
  onlyWithReadme: boolean
  promotion: PromotionFilter | null
}

let {
  types,
  frameworks,
  runners,
  hosts,
  showTools,
  selectedTypes = $bindable(),
  selectedFrameworks = $bindable(),
  selectedRunners = $bindable(),
  selectedHosts = $bindable(),
  selectedTools = $bindable(),
  onlyWithDev = $bindable(),
  onlyWithReadme = $bindable(),
  promotion = $bindable(),
}: Props = $props()

const namedFrameworks = $derived(frameworks.filter((f) => f !== 'unknown'))

const promotions: { id: PromotionFilter; label: string }[] = [
  { id: 'promoted', label: 'Promoted' },
  { id: 'unpromoted', label: 'Unpromoted' },
  { id: 'in-progress', label: 'In progress' },
]

function togglePromotion(id: PromotionFilter): void {
  promotion = promotion === id ? null : id
}
</script>

<Card>
  <div class="groups">
    <div class="group">
      <p class="t-eyebrow">Type</p>
      <div class="chips">
        {#each types as type (type)}
          <Chip
            pressed={selectedTypes.has(type)}
            dot={typeColor(type)}
            onclick={() => {
              selectedTypes = toggleSet(selectedTypes, type)
            }}
          >
            {type}
          </Chip>
        {/each}
      </div>
    </div>

    <div class="group">
      <p class="t-eyebrow">Framework</p>
      <div class="chips">
        {#each namedFrameworks as framework (framework)}
          <Chip
            pressed={selectedFrameworks.has(framework)}
            dot={frameworkColor(framework)}
            onclick={() => {
              selectedFrameworks = toggleSet(selectedFrameworks, framework)
            }}
          >
            {framework}
          </Chip>
        {/each}
      </div>
    </div>

    <div class="group">
      <p class="t-eyebrow">Runner</p>
      <div class="chips">
        {#each runners as runner (runner)}
          <Chip
            pressed={selectedRunners.has(runner)}
            onclick={() => {
              selectedRunners = toggleSet(selectedRunners, runner)
            }}
          >
            {runner}
          </Chip>
        {/each}
      </div>
    </div>

    <!-- Only worth a facet once a second machine is in the catalog. -->
    {#if hosts.length > 1}
      <div class="group">
        <p class="t-eyebrow">Host</p>
        <div class="chips">
          {#each hosts as host (host)}
            <Chip
              pressed={selectedHosts.has(host)}
              onclick={() => {
                selectedHosts = toggleSet(selectedHosts, host)
              }}
            >
              {host}
            </Chip>
          {/each}
        </div>
      </div>
    {/if}

    {#if showTools}
      <div class="group">
        <p class="t-eyebrow">Tools</p>
        <div class="chips">
          <Chip
            pressed={selectedTools.has('just')}
            dot="#fbbf24"
            onclick={() => {
              selectedTools = toggleSet(selectedTools, 'just')
            }}
          >
            just
          </Chip>
        </div>
      </div>
    {/if}

    <div class="group">
      <p class="t-eyebrow">Features</p>
      <div class="chips">
        <Chip
          pressed={onlyWithDev}
          onclick={() => {
            onlyWithDev = !onlyWithDev
          }}
        >
          Has dev command
        </Chip>
        <Chip
          pressed={onlyWithReadme}
          onclick={() => {
            onlyWithReadme = !onlyWithReadme
          }}
        >
          Has README
        </Chip>
      </div>
    </div>

    <div class="group">
      <p class="t-eyebrow">Promotion</p>
      <div class="chips">
        {#each promotions as option (option.id)}
          <Chip pressed={promotion === option.id} onclick={() => togglePromotion(option.id)}>
            {option.label}
          </Chip>
        {/each}
      </div>
    </div>
  </div>
</Card>

<style>
  .groups {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .group {
    display: grid;
    grid-template-columns: 84px 1fr;
    align-items: start;
    gap: var(--space-3);
  }

  .group p {
    margin: 0;
    padding-top: 5px;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  @media (max-width: 768px) {
    .group {
      grid-template-columns: 1fr;
      gap: var(--space-2);
    }
  }
</style>
