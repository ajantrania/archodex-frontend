import { Handle, Position, XYPosition, type Node, type NodeProps } from '@xyflow/react';

import ResourceIcons from './components/ResourceIcons';
import { envColorByIndex, labelForResource, lucideIconUrl, mergeRefs, typeIdFromResourceId } from './lib/utils';
import { AlertTriangle, Plus, X } from 'lucide-react';
import { Badge } from './components/ui/badge';
import { useCallback, useContext, useEffect, useState } from 'react';
import TutorialCallbacksContext from './components/Tutorial/CallbacksContext';
import { Tooltip, TooltipContent, TooltipTrigger } from './components/ui/tooltip';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from './components/ui/command';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from './components/ui/dialog';
import QueryDataContext from './contexts/QueryDataContext';
import QueryDataDispatchContext from './contexts/QueryDataDispatchContext';
import { QueryDataActions } from './hooks/useQueryData';
import { useNavigate, useOutletContext } from 'react-router';
import { AccountRoutesContext } from './AccountRoutes';
import { toast } from './hooks/use-toast';
import posthog from 'posthog-js';

export interface ResourceEnvironmentData {
  name: string;
  colorIndex: number;
  inheritedFrom?: ResourceId;
}

export interface ResourceNodeData extends Record<string, unknown> {
  id: ResourceId;
  numChildren: number;
  collapsed: boolean;
  environments: ResourceEnvironmentData[];
  resourceIssueIds: string[];
  originalParentId?: string;
  originalParentResourceId?: ResourceId;
  originalDimensions?: { width: number; height: number };
  parentResourceId?: ResourceId;
  absolutePosition: XYPosition;
  firstSeenAt?: Date;
  lastSeenAt?: Date;
  highlighted?: boolean;
}

type ResourceNode = Node<ResourceNodeData, 'resource'>;

const containerClassName = (selected: boolean, data: ResourceNodeData) => {
  const isOpenContainer = data.numChildren > 0 && !data.collapsed;

  const classes = [
    'w-full',
    isOpenContainer ? `h-[var(--resource-title-height)]` : 'h-full',
    'flex-none',

    // Border
    'after:content-[""]',
    'after:absolute',
    'after:top-0',
    'after:left-0',
    'after:right-0',
    'after:bottom-0',
    'after:bg-none',
    'after:rounded-md',
    'after:border-primary',
    'after:pointer-events-none',
  ];

  if (selected) {
    classes.push(
      // White background border for between double-style border
      'before:content-[""]',
      'before:absolute',
      'before:top-0',
      'before:left-0',
      'before:right-0',
      'before:bottom-0',
      'before:bg-none',
      'before:rounded-md',
      'before:border-[5px]',
      'before:border-background',

      'after:border-[6px]',
      'after:border-double',
    );
  } else {
    classes.push('after:border', 'after:border-primary');
  }

  return classes.join(' ');
};

const titleClassName = (data: ResourceNodeData) => {
  const isOpenContainer = data.numChildren > 0 && !data.collapsed;

  const classes = ['flex', 'h-full', 'pl-3', 'pr-2', 'items-center', 'text-lg'];

  if (!data.highlighted) {
    if (isOpenContainer) {
      classes.push('rounded-t-md', 'border-b', 'border-primary');
    } else {
      classes.push('rounded-md');
    }
  } else {
    classes.push('bg-primary', 'text-black');

    if (data.selected) {
      if (isOpenContainer) {
        classes.push('rounded-t-md');
      } else {
        classes.push('rounded-md');
      }
    }
  }

  return classes.join(' ');
};

const envClassName = (index: number, inherited: boolean) => {
  const color = envColorByIndex(index);

  const classes = [
    'block',
    'flex',
    'items-center',
    `size-[var(--env-badge-size)]`,
    'p-0',
    'rounded-full',
    `bg-${color}${inherited ? '-inherited' : ''}`,
    'border-1',
    `border-${color}`,
    'text-center',
    'text-black',
    'pointer-events-auto',
    'cursor-pointer',
  ];

  if (inherited) {
    classes.push('border-dashed', 'border-slate-400');
  }

  return classes.join(' ');
};

const popoverColor = (index: number, inherited: boolean) => {
  return `bg-${envColorByIndex(index)}${inherited ? '-inherited' : ''}`;
};

const alertClassName = () => {
  const classes = [
    'block',
    `size-[var(--issue-badge-size)]`,
    'rounded-full',
    'bg-red-500',
    'border-red-500',
    'text-background',
    'p-1',
    'shadow-lg',
    '[&>svg]:size-4',
    'text-center',
    'pointer-events-auto',
  ];

  return classes.join(' ');
};

const ResourceNode = ({ id, selected, data }: NodeProps<ResourceNode>) => {
  const navigate = useNavigate();
  const { elementRef, openTagEnvironmentDialogRef } = useContext(TutorialCallbacksContext).refs;
  const [prevSelected, setPrevSelected] = useState(selected);
  const accountContext = useOutletContext<AccountRoutesContext>();
  const queryData = useContext(QueryDataContext);
  const queryDataDispatch = useContext(QueryDataDispatchContext);
  const [envTooltipOpen, setEnvTooltipOpen] = useState<string | undefined>();
  const [addEnvPopoverOpen, setAddEnvPopoverOpen] = useState(false);
  const [addEnvInput, setAddEnvInput] = useState('');

  const selectResourceIssues = useCallback(
    (data: ResourceNodeData) => {
      posthog.capture('resource_node_issue_badge_clicked', { resource_type: typeIdFromResourceId(data.id) });

      if (location.pathname.endsWith('/events')) {
        void navigate('../issues', { replace: true, relative: 'path' });
      } else if (!location.pathname.endsWith('/issues')) {
        void navigate('./issues', { replace: true, relative: 'path' });
      }

      for (const issueId of data.resourceIssueIds) {
        queryDataDispatch({ action: QueryDataActions.SelectIssue, issueId, refitView: false });
      }
    },
    [queryDataDispatch, navigate],
  );

  useEffect(() => {
    if (selected && !prevSelected) {
      openTagEnvironmentDialogRef(setAddEnvPopoverOpen);
    } else if (!selected && prevSelected) {
      openTagEnvironmentDialogRef(null);
    }
    setPrevSelected(selected);
  }, [openTagEnvironmentDialogRef, prevSelected, selected]);

  useEffect(() => {
    setAddEnvPopoverOpen(false);
  }, [selected]);

  const tagEnvironment = useCallback(
    (envName: string) => {
      const taggingToast = toast({ title: 'Updating environments for resource...', duration: Infinity });

      queryDataDispatch({
        action: QueryDataActions.TagEnvironment,
        accountContext,
        resourceId: data.id,
        environment: envName,
        callback(errorMessage?: string) {
          taggingToast.dismiss();

          if (!errorMessage) {
            toast({ title: 'Environments updated for resource' });
            posthog.capture('resource_tagged_with_environment', { resource_type: typeIdFromResourceId(data.id) });
          } else {
            toast({
              title: 'Failed to update environments for resource',
              variant: 'destructive',
              duration: Infinity,
              description: errorMessage,
            });

            posthog.captureException(new Error(`Failed to tag resource with environment: ${errorMessage}`));
          }
        },
      });
    },
    [queryDataDispatch, accountContext, data.id],
  );

  const untagEnvironment = useCallback(
    (envName: string) => {
      const untaggingToast = toast({ title: 'Updating environments for resource...', duration: Infinity });

      queryDataDispatch({
        action: QueryDataActions.UntagEnvironment,
        accountContext,
        resourceId: data.id,
        environment: envName,
        callback(errorMessage?: string) {
          untaggingToast.dismiss();

          if (!errorMessage) {
            toast({ title: 'Environments updated for resource' });
            posthog.capture('resource_untagged_from_environment', { resource_type: typeIdFromResourceId(data.id) });
          } else {
            toast({
              title: 'Failed to update environments for resource',
              variant: 'destructive',
              duration: Infinity,
              description: errorMessage,
            });

            posthog.captureException(new Error(`Failed to untag resource from environment: ${errorMessage}`));
          }
        },
      });
    },
    [queryDataDispatch, accountContext, data.id],
  );

  const tutorialSecretIssueRef =
    id === '::Secret Value::2659c91418643fa45351fc9cc8ee7df783c83d9f90999a4ad1babc834983451c'
      ? elementRef('prodStripeSecretAlert')
      : undefined;
  const isTutorialSendGridSecret =
    id ===
    '::Kubernetes Cluster::d77d838b-bdca-419f-9a55-71d8a8c34439::Namespace::vault::Service::vault::HashiCorp Vault Service::vault.vault::Secrets Engine Mount::vault::Secret::prod/sendgrid';

  const tutorialSendGridSecretRef = isTutorialSendGridSecret ? elementRef('sendGridSecret') : undefined;

  const tutorialSendGridSecretAddEnvironmentRef = isTutorialSendGridSecret
    ? elementRef('sendGridSecretAddEnvironment')
    : undefined;
  const tutorialSendGridSecretAddEnvironmentDialogRef = isTutorialSendGridSecret
    ? elementRef('sendGridSecretAddEnvironmentDialog')
    : undefined;
  const tutorialSendGridSecretIssueRef = isTutorialSendGridSecret ? elementRef('sendGridSecretAlert') : undefined;

  const currentEnvs = new Set(queryData.environments);
  const addEnvValues = new Set(currentEnvs);
  if (addEnvInput) {
    addEnvValues.add(addEnvInput);
  }

  return (
    <div
      className={`relative inline-block size-full pt-[calc(var(--issue-badge-size)/2)] pr-[calc(var(--issue-badge-size)/2)]`}
    >
      <div className={`absolute z-10 top-0 right-0 h-[var(--issue-badge-size)] flex items-center justify-end`}>
        <div className="flex gap-1">
          {data.environments.map((env, index) => (
            <div key={index}>
              <div className={`size-[var(--env-badge-size)]`}>
                <Tooltip
                  open={envTooltipOpen === env.name}
                  onOpenChange={(open) => {
                    if (open) {
                      setEnvTooltipOpen(env.name);
                      posthog.capture('resource_environment_tooltip_opened', {
                        resource_type: typeIdFromResourceId(data.id),
                        env_inherited_from_resource_type: env.inheritedFrom
                          ? typeIdFromResourceId(env.inheritedFrom)
                          : undefined,
                      });
                    }
                  }}
                >
                  <TooltipTrigger asChild>
                    <Badge
                      className={envClassName(env.colorIndex, env.inheritedFrom !== undefined)}
                      onClick={(e) => {
                        setEnvTooltipOpen(envTooltipOpen === env.name ? undefined : env.name);
                        if (env.inheritedFrom === undefined) {
                          untagEnvironment(env.name);
                        }
                        e.stopPropagation();
                      }}
                      onMouseLeave={() => {
                        setEnvTooltipOpen(undefined);
                      }}
                    >
                      {envTooltipOpen === env.name && env.inheritedFrom === undefined ? (
                        <X />
                      ) : (
                        env.name.charAt(0).toUpperCase()
                      )}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent
                    className={[
                      popoverColor(env.colorIndex, env.inheritedFrom !== undefined),
                      'text-center',
                      'text-black',
                    ].join(' ')}
                  >
                    <span className="font-semibold">{env.name}</span>
                    {env.inheritedFrom !== undefined && (
                      <>
                        <br />
                        <br />
                        <span>
                          Inherited from {env.inheritedFrom.at(-1)?.type} &quot;
                          {env.inheritedFrom.at(-1)?.id}&quot;
                        </span>
                      </>
                    )}
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          ))}

          {selected && (
            <div className={`size-[var(--env-badge-size)]`}>
              <Dialog
                open={addEnvPopoverOpen}
                onOpenChange={(open) => {
                  setAddEnvPopoverOpen(open);
                  setAddEnvInput('');
                  if (open) {
                    posthog.capture('resource_add_environment_dialog_opened', {
                      resource_type: typeIdFromResourceId(data.id),
                    });
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Badge
                    className={envClassName(0, false) + ' bg-background text-primary border-primary'}
                    ref={tutorialSendGridSecretAddEnvironmentRef}
                  >
                    <Plus />
                  </Badge>
                </DialogTrigger>
                <DialogContent>
                  <DialogTitle>Add Environment</DialogTitle>
                  <Command>
                    <CommandInput value={addEnvInput} onValueChange={setAddEnvInput} />
                    <CommandList>
                      <CommandGroup>
                        {Array.from(addEnvValues).map((envName) => (
                          <CommandItem
                            key={envName}
                            value={envName}
                            onSelect={(value) => {
                              tagEnvironment(value);
                              setAddEnvPopoverOpen(false);
                            }}
                            ref={envName === 'prod' ? tutorialSendGridSecretAddEnvironmentDialogRef : undefined}
                          >
                            {currentEnvs.has(envName) ? (
                              envName
                            ) : (
                              <>
                                {envName} <span className="text-muted-foreground text-xs">(new)</span>
                              </>
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </DialogContent>
              </Dialog>
            </div>
          )}

          <div className={data.resourceIssueIds.length > 0 ? 'pr-[8px]' : 'pr-[15px]'} />
        </div>

        {data.resourceIssueIds.length > 0 && (
          <div className={`size-[var(--issue-badge-size)]`}>
            <Badge
              className={alertClassName()}
              onClick={(e) => {
                selectResourceIssues(data);
                e.stopPropagation();
              }}
              ref={mergeRefs(tutorialSecretIssueRef, tutorialSendGridSecretIssueRef)}
            >
              <AlertTriangle className="translate-x-[0.25px] translate-y-[-1px]" strokeWidth={2.5} />
            </Badge>
          </div>
        )}
      </div>

      <div
        className={[
          'relative',
          'size-full',
          'flex',
          'flex-col',
          'rounded-md',
          'overflow-hidden',
          // 'shadow-lg',
          // 'hover:shadow-2xl',
          // 'focus:shadow-2xl',
          // 'shadow-lg-dark',
          // 'dark:hover:shadow-2xl-dark',
          // 'dark:focus:shadow-2xl-dark',
          'hover:outline-hover',
          'hover:outline-2',
          'hover:outline-offset-4',
          'pointer-events-auto',
        ].join(' ')}
        ref={tutorialSendGridSecretRef}
      >
        <div className={containerClassName(selected, data)}>
          <Handle type="target" position={Position.Left} style={{ visibility: 'hidden' }} />
          <div className={titleClassName(data)}>
            <ResourceIcons id={data.id} parentResourceId={data.parentResourceId} highlighted={data.highlighted} />

            <span
              className={`ml-2 py-2 inline-flex items-center ${data.numChildren > 0 ? '' : 'mr-2'} whitespace-nowrap`}
            >
              {labelForResource(data.id, data.parentResourceId)}
            </span>

            {data.numChildren > 0 && (
              <div
                className={`h-[39px] aspect-[0.7] ${data.highlighted ? 'bg-black' : 'bg-primary'}`}
                style={{
                  mask: `url(${lucideIconUrl(data.collapsed ? 'chevron-down' : 'chevron-up')}) no-repeat center / 86%`,
                }}
                onClick={(e) => {
                  queryDataDispatch({ action: QueryDataActions.ToggleNodeCollapsed, nodeId: id });
                  e.stopPropagation();
                }}
              />
            )}
          </div>
          <Handle type="source" position={Position.Right} style={{ visibility: 'hidden' }} />
        </div>

        {/* Render side and bottom borders of container */}
        {data.numChildren > 0 && !data.collapsed && <div className={'grow rounded-b-md'} />}
      </div>
    </div>
  );
};

export default ResourceNode;
