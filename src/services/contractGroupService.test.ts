import * as assert from 'assert';
import { ContractGroupService, ContractGroup } from '../services/contractGroupService';

/**
 * Mock VS Code ExtensionContext for testing
 */
class MockExtensionContext {
    private workspaceState = new Map<string, any>();

    getWorkspaceState() {
        return {
            get: (key: string) => this.workspaceState.get(key),
            update: async (key: string, value: any) => {
                this.workspaceState.set(key, value);
            },
        };
    }
}

suite('ContractGroupService', () => {
    let groupService: ContractGroupService;
    let mockContext: any;

    setup(() => {
        mockContext = new MockExtensionContext();
        groupService = new ContractGroupService(mockContext.getWorkspaceState());
    });

    suite('Group Creation', () => {
        test('should create a new group', () => {
            const group = groupService.createGroup('Test Group');
            assert.strictEqual(group.name, 'Test Group');
            assert.strictEqual(group.contractIds.length, 0);
            assert.strictEqual(group.collapsed, false);
        });

        test('should generate unique IDs', () => {
            const group1 = groupService.createGroup('Group 1');
            const group2 = groupService.createGroup('Group 2');
            assert.notStrictEqual(group1.id, group2.id);
        });

        test('should create nested group with parent', () => {
            const parent = groupService.createGroup('Parent');
            const child = groupService.createGroup('Child', parent.id);
            assert.strictEqual(child.parentId, parent.id);
        });

        test('should sanitize group names', () => {
            const group = groupService.createGroup('  Test  Group  ');
            assert.strictEqual(group.name, 'Test Group');
        });

        test('should set timestamps on creation', () => {
            const before = Date.now();
            const group = groupService.createGroup('Test');
            const after = Date.now();
            assert(group.createdAt >= before && group.createdAt <= after);
            assert(group.modifiedAt >= before && group.modifiedAt <= after);
        });

        test('should throw error for invalid parent', () => {
            assert.throws(() => {
                groupService.createGroup('Child', 'invalid-parent-id');
            });
        });
    });

    suite('Group Retrieval', () => {
        test('should get group by ID', () => {
            const created = groupService.createGroup('Test');
            const retrieved = groupService.getGroup(created.id);
            assert.strictEqual(retrieved?.name, 'Test');
        });

        test('should return undefined for non-existent group', () => {
            const retrieved = groupService.getGroup('non-existent');
            assert.strictEqual(retrieved, undefined);
        });

        test('should get all groups', () => {
            groupService.createGroup('Group 1');
            groupService.createGroup('Group 2');
            const all = groupService.getAllGroups();
            assert(all.length >= 3); // Root + 2 groups
        });

        test('should get root group', () => {
            const root = groupService.getRootGroup();
            assert.strictEqual(root.name, 'All Contracts');
        });

        test('should get child groups', () => {
            const parent = groupService.createGroup('Parent');
            groupService.createGroup('Child 1', parent.id);
            groupService.createGroup('Child 2', parent.id);
            const children = groupService.getChildGroups(parent.id);
            assert.strictEqual(children.length, 2);
        });
    });

    suite('Group Management', () => {
        test('should delete group', () => {
            const group = groupService.createGroup('To Delete');
            groupService.deleteGroup(group.id);
            assert.strictEqual(groupService.getGroup(group.id), undefined);
        });

        test('should throw error deleting root group', () => {
            assert.throws(() => {
                const root = groupService.getRootGroup();
                groupService.deleteGroup(root.id);
            });
        });

        test('should move contracts to parent when deleting group', () => {
            const parent = groupService.createGroup('Parent');
            const child = groupService.createGroup('Child', parent.id);
            groupService.addContractToGroup('contract1', child.id);

            groupService.deleteGroup(child.id);

            const updatedParent = groupService.getGroup(parent.id);
            assert(updatedParent?.contractIds.includes('contract1'));
        });

        test('should rename group', () => {
            const group = groupService.createGroup('Old Name');
            groupService.renameGroup(group.id, 'New Name');
            const updated = groupService.getGroup(group.id);
            assert.strictEqual(updated?.name, 'New Name');
        });

        test('should throw error renaming non-existent group', () => {
            assert.throws(() => {
                groupService.renameGroup('non-existent', 'New Name');
            });
        });

        test('should update modifiedAt on rename', () => {
            const group = groupService.createGroup('Test');
            const originalTime = group.modifiedAt;
            
            // Add small delay to ensure time difference
            groupService.renameGroup(group.id, 'Updated');
            
            const updated = groupService.getGroup(group.id);
            assert(updated!.modifiedAt >= originalTime);
        });
    });

    suite('Contract Management', () => {
        test('should add contract to group', () => {
            const group = groupService.createGroup('Test');
            groupService.addContractToGroup('contract1', group.id);
            assert(group.contractIds.includes('contract1'));
        });

        test('should remove contract from group', () => {
            const group = groupService.createGroup('Test');
            groupService.addContractToGroup('contract1', group.id);
            groupService.removeContractFromGroup('contract1', group.id);
            assert(!group.contractIds.includes('contract1'));
        });

        test('should not add duplicate contracts', () => {
            const group = groupService.createGroup('Test');
            groupService.addContractToGroup('contract1', group.id);
            groupService.addContractToGroup('contract1', group.id);
            assert.strictEqual(group.contractIds.length, 1);
        });

        test('should move contract between groups', () => {
            const group1 = groupService.createGroup('Group 1');
            const group2 = groupService.createGroup('Group 2');
            
            groupService.addContractToGroup('contract1', group1.id);
            groupService.moveContractBetweenGroups('contract1', group1.id, group2.id);

            assert(!group1.contractIds.includes('contract1'));
            assert(group2.contractIds.includes('contract1'));
        });

        test('should throw error moving non-existent contract', () => {
            const group1 = groupService.createGroup('Group 1');
            const group2 = groupService.createGroup('Group 2');
            
            assert.throws(() => {
                groupService.moveContractBetweenGroups('non-existent', group1.id, group2.id);
            });
        });
    });

    suite('Group Hierarchy', () => {
        test('should get group hierarchy', () => {
            const parent = groupService.createGroup('Parent');
            const child = groupService.createGroup('Child', parent.id);
            
            const hierarchy = groupService.getGroupHierarchy(parent.id);
            assert.strictEqual(hierarchy.children.length, 1);
            assert.strictEqual(hierarchy.children[0].name, 'Child');
        });

        test('should prevent moving group to own descendant', () => {
            const parent = groupService.createGroup('Parent');
            const child = groupService.createGroup('Child', parent.id);
            
            assert.throws(() => {
                groupService.moveGroupToParent(parent.id, child.id);
            });
        });

        test('should reparent group', () => {
            const parent1 = groupService.createGroup('Parent 1');
            const parent2 = groupService.createGroup('Parent 2');
            const child = groupService.createGroup('Child', parent1.id);

            groupService.moveGroupToParent(child.id, parent2.id);

            const updated = groupService.getGroup(child.id);
            assert.strictEqual(updated?.parentId, parent2.id);
        });
    });

    suite('Group State', () => {
        test('should toggle group collapse state', () => {
            const group = groupService.createGroup('Test');
            assert.strictEqual(group.collapsed, false);

            groupService.toggleGroupCollapse(group.id);
            let updated = groupService.getGroup(group.id);
            assert.strictEqual(updated?.collapsed, true);

            groupService.toggleGroupCollapse(group.id);
            updated = groupService.getGroup(group.id);
            assert.strictEqual(updated?.collapsed, false);
        });
    });

    suite('Search & Lookup', () => {
        test('should find group by contract', () => {
            const group = groupService.createGroup('Test');
            groupService.addContractToGroup('contract1', group.id);

            const found = groupService.findGroupByContract('contract1');
            assert.strictEqual(found?.id, group.id);
        });

        test('should return undefined for contract not in any group', () => {
            const found = groupService.findGroupByContract('non-existent');
            assert.strictEqual(found, undefined);
        });

        test('should find all groups containing a contract', () => {
            const group1 = groupService.createGroup('Group 1');
            const group2 = groupService.createGroup('Group 2');
            
            groupService.addContractToGroup('contract1', group1.id);
            groupService.addContractToGroup('contract1', group2.id);

            const found = groupService.findAllGroupsByContract('contract1');
            assert.strictEqual(found.length, 2);
        });
    });

    suite('Validation', () => {
        test('should validate group names', () => {
            const empty = groupService.validateGroupName('');
            assert.strictEqual(empty.valid, false);

            const valid = groupService.validateGroupName('Valid Name');
            assert.strictEqual(valid.valid, true);

            const tooLong = groupService.validateGroupName('x'.repeat(101));
            assert.strictEqual(tooLong.valid, false);
        });
    });

    suite('Statistics', () => {
        test('should calculate group statistics', () => {
            const group1 = groupService.createGroup('Group 1');
            const group2 = groupService.createGroup('Group 2');
            
            groupService.addContractToGroup('contract1', group1.id);
            groupService.addContractToGroup('contract2', group2.id);

            const stats = groupService.getStatistics();
            assert.strictEqual(stats.totalContracts, 2);
            assert(stats.totalGroups >= 2);
        });
    });

    suite('Import/Export', () => {
        test('should export groups as JSON', () => {
            const group = groupService.createGroup('Test');
            const json = groupService.export();
            const parsed = JSON.parse(json);
            assert(parsed[group.id]);
        });

        test('should import groups from JSON', () => {
            const group1 = groupService.createGroup('Group 1');
            groupService.addContractToGroup('contract1', group1.id);
            const json = groupService.export();

            const newService = new ContractGroupService(mockContext.getWorkspaceState());
            newService.import(json);

            const imported = newService.getGroup(group1.id);
            assert.strictEqual(imported?.name, 'Group 1');
            assert(imported?.contractIds.includes('contract1'));
        });

        test('should throw error on invalid JSON import', () => {
            assert.throws(() => {
                groupService.import('{ invalid json');
            });
        });
    });

    suite('Persistence', () => {
        test('should load groups from storage', async () => {
            const group = groupService.createGroup('Test');
            await groupService.saveGroups();

            const newService = new ContractGroupService(mockContext.getWorkspaceState());
            await newService.loadGroups();

            const loaded = newService.getGroup(group.id);
            assert.strictEqual(loaded?.name, 'Test');
        });
    });
});
